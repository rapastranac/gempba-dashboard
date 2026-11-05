import { expect } from 'chai';
import * as net from 'net';
import { TelemetryClient } from '@gempba/telemetry/lib/node/client/telemetry-client';
import { BroadcastEnvelope, ControlKind } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { MockConfig, MockLive, MockShape } from '../../common/mock-config';
import { MockRun } from '../sim/mock-run';
import { MockAggregator, MockAggregatorOptions } from './mock-aggregator';
import { MockTcpEndpoint } from './tcp-endpoint';

/** A raw client that collects the lines it reads. */
class LineClient {

    readonly lines: string[] = [];
    readonly socket: net.Socket;
    closed = false;
    protected buffered = '';

    constructor(port: number) {
        this.socket = net.createConnection(port, '127.0.0.1');
        this.socket.setEncoding('utf8');
        this.socket.on('data', (chunk: string) => {
            this.buffered += chunk;
            let newline = this.buffered.indexOf('\n');
            while (newline >= 0) {
                this.lines.push(this.buffered.slice(0, newline));
                this.buffered = this.buffered.slice(newline + 1);
                newline = this.buffered.indexOf('\n');
            }
        });
        this.socket.on('error', () => undefined);
        this.socket.on('close', () => this.closed = true);
    }
}

describe('MockAggregator', () => {

    const defaults = MockConfig.defaults();
    let aggregator: MockAggregator;
    let endpoint: MockTcpEndpoint;
    let port: number;
    let logged: string[];
    let ended: boolean;
    const clients: { close(): void }[] = [];

    async function serve(live: Partial<MockLive> = {}, shape: Partial<MockShape> = {}, intervalMs?: number, options: MockAggregatorOptions = {}): Promise<void> {
        logged = [];
        ended = false;
        const run = new MockRun({ ...defaults.shape, ...shape }, defaults.scheduler, { ...defaults.live, ...live }, 42, intervalMs);
        aggregator = new MockAggregator(run, { ...options, log: message => logged.push(message), onEnded: () => ended = true });
        aggregator.start();
        endpoint = new MockTcpEndpoint(aggregator);
        port = await endpoint.listen(0);
    }

    function lineClient(): LineClient {
        const client = new LineClient(port);
        clients.push({ close: () => client.socket.destroy() });
        return client;
    }

    async function until(condition: () => boolean, timeoutMs = 3000): Promise<void> {
        const deadline = Date.now() + timeoutMs;
        while (!condition()) {
            if (Date.now() > deadline) {
                throw new Error('timed out');
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    afterEach(async () => {
        clients.splice(0).forEach(client => client.close());
        aggregator.stop();
        await endpoint.close();
    });

    it('sends the first frame the moment a client connects, though it broadcasts every 500 ms', async () => {
        await serve();
        const client = lineClient();
        const connectedAt = Date.now();
        await until(() => client.lines.length > 0);
        expect(Date.now() - connectedAt).to.be.below(400);
        expect(BroadcastEnvelope.parse(client.lines[0]).ranks).to.have.lengthOf(8);
        expect(logged).to.deep.equal([`TCP client ${client.socket.localPort} connected`]);
    });

    it('streams to the dashboard\'s own client, and applies its control lines at once, clamped as gempba does', async () => {
        await serve({ fidelity: 'full' });
        const frames: BroadcastEnvelope[] = [];
        const telemetry = new TelemetryClient('127.0.0.1', port, { onConnected: () => undefined, onFrame: frame => frames.push(frame), onDisconnected: () => undefined });
        clients.push(telemetry);
        telemetry.start();
        await until(() => frames.length > 0);
        expect(telemetry.sendControl(ControlKind.SetWorkerIntervalMs, 10)).to.equal(true);
        await until(() => aggregator.run.intervalMs === 50);
        expect(logged.some(message => message.startsWith('set_worker_interval_ms → 50 ms (clamped from 10), from TCP client'))).to.equal(true);
        const counted = frames.length;
        await new Promise(resolve => setTimeout(resolve, 600));
        expect(frames.length - counted).to.be.at.least(5);
        telemetry.sendControl(ControlKind.SetNodeIntervalMs, 2000);
        await until(() => logged.some(message => message.startsWith('Ignored set_node_interval_ms')));
        expect(aggregator.run.intervalMs, 'gempba 4.3 ignores the node interval').to.equal(50);
    });

    it('pauses, marks, snapshots and resumes when a client asks, as gempba 4.3 does', async () => {
        await serve();
        const client = lineClient();
        await until(() => client.lines.length > 0);
        const write = (control: object) => client.socket.write(JSON.stringify(control) + '\n');
        const parsed = () => client.lines.map(line => BroadcastEnvelope.parse(line));
        write({ kind: 'set_interval_ms', value: 100 });
        await until(() => aggregator.run.intervalMs === 100);
        write({ kind: 'pause' });
        await until(() => parsed().some(line => line.paused && line.ranks === undefined));
        write({ kind: 'mark', label: 'phase 2' });
        await until(() => logged.some(message => message.startsWith('Marked "phase 2"')));
        write({ kind: 'snapshot' });
        await until(() => parsed().some(line => line.paused && line.ranks !== undefined));
        expect(parsed().find(line => line.paused && line.ranks !== undefined)!.topology!.run!.markers![0].label).to.equal('phase 2');
        write({ kind: 'resume' });
        const seen = client.lines.length;
        await until(() => parsed().slice(seen).some(line => line.paused === false && line.ranks !== undefined));
    });

    it('drops a client that falls behind, and keeps serving the others', async function (): Promise<void> {
        this.timeout(15_000);
        await serve({ fidelity: 'full' }, { nodes: 16, ranksPerNode: 32 }, 50, { maxBufferedBytes: 512 * 1024 });
        const stalled = lineClient();
        stalled.socket.pause();
        const healthy = lineClient();
        // a paused client reads nothing, so it never sees the close itself
        await until(() => logged.some(message => message.endsWith('it fell too far behind')), 12_000);
        expect(aggregator.clients).to.equal(1);
        const seen = healthy.lines.length;
        await until(() => healthy.lines.length > seen + 2);
        expect(healthy.closed).to.equal(false);
    });

    it('drops a client that sends too much without a newline, and skips a malformed control line', async () => {
        await serve();
        const chatty = lineClient();
        await until(() => chatty.lines.length > 0);
        chatty.socket.write('{"kind":"set_everything","value":1}\n');
        await until(() => logged.some(message => message.startsWith('Ignored a malformed control line')));
        chatty.socket.write('x'.repeat(70 * 1024));
        await until(() => chatty.closed);
        expect(logged.some(message => message.endsWith('it sent too much without a newline'))).to.equal(true);
    });

    it('sends a malformed line the dashboard skips, drops every client, and closes them when the run ends', async () => {
        await serve({ fidelity: 'full' });
        const client = lineClient();
        await until(() => client.lines.length > 0);
        expect(aggregator.fault('malformed-line')).to.equal('Sent a malformed line');
        await until(() => client.lines.length > 2);
        const malformed = client.lines.indexOf('{"version":1,"ts":');
        expect(malformed).to.be.above(0);
        expect(() => BroadcastEnvelope.parse(client.lines[malformed])).to.throw();
        expect(() => BroadcastEnvelope.parse(client.lines[malformed + 1])).not.to.throw();
        expect(aggregator.fault('drop-clients')).to.equal('Dropped 1 client');
        await until(() => client.closed && aggregator.clients === 0);
        expect(client.lines.some(line => line.includes('"final":true')), 'a dropped client gets no final line').to.equal(false);
        const late = lineClient();
        await until(() => late.lines.length > 0);
        expect(aggregator.fault('end-run')).to.equal('Ended the run, as when gempba\'s process exits');
        await until(() => late.closed);
        expect(ended).to.equal(true);
        expect(aggregator.clients).to.equal(0);
        expect(BroadcastEnvelope.parse(late.lines[late.lines.length - 1]).final, 'the run\'s final line').to.equal(true);
    });

    it('ends the run with its final line, every rank\'s last frame, the only line marked final', async () => {
        await serve();
        const client = lineClient();
        await until(() => client.lines.length > 0);
        aggregator.fault('end-run');
        await until(() => client.closed);
        const lines = client.lines.map(line => BroadcastEnvelope.parse(line));
        expect(lines.map(line => line.final)).to.deep.equal([...lines.slice(1).map(() => false), true]);
        const [before, last] = [lines[lines.length - 2], lines[lines.length - 1]];
        expect(last.ranks!.map(frame => frame.seq_no)).to.deep.equal(before.ranks!.map(frame => frame.seq_no + 1));
        expect(logged).to.include('Sent the run\'s final line to 1 client');
    });

    it('sends the final line on Stop too, with every frame though paused', async () => {
        await serve();
        const client = lineClient();
        await until(() => client.lines.length > 0);
        client.socket.write('{"kind":"pause"}\n');
        await until(() => aggregator.run.paused);
        aggregator.stop();
        await until(() => client.closed);
        const last = BroadcastEnvelope.parse(client.lines[client.lines.length - 1]);
        expect([last.paused, last.final, last.ranks?.length]).to.deep.equal([true, true, aggregator.run.topology.ranks.length]);
    });
});
