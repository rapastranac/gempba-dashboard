import { expect } from 'chai';
import * as net from 'net';
import { RefreshRates } from '@gempba/core';
import { TelemetryClient } from '@gempba/telemetry/lib/node/client/telemetry-client';
import { BroadcastEnvelope, ControlKind } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { MockConfig, MockLive, MockShape } from '../../common/mock-config';
import { MockRun } from '../sim/mock-run';
import { MockCenter, MockCenterOptions } from './mock-center';
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

describe('MockCenter', () => {

    const defaults = MockConfig.defaults();
    let center: MockCenter;
    let endpoint: MockTcpEndpoint;
    let port: number;
    let logged: string[];
    let ended: boolean;
    const clients: { close(): void }[] = [];

    async function serve(live: Partial<MockLive> = {}, shape: Partial<MockShape> = {}, rates?: RefreshRates, options: MockCenterOptions = {}): Promise<void> {
        logged = [];
        ended = false;
        const run = new MockRun({ ...defaults.shape, ...shape }, defaults.scheduler, { ...defaults.live, ...live }, 42, rates);
        center = new MockCenter(run, { ...options, log: message => logged.push(message), onEnded: () => ended = true });
        center.start();
        endpoint = new MockTcpEndpoint(center);
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
        center.stop();
        await endpoint.close();
    });

    it('sends the first frame the moment a client connects, though it broadcasts every 500 ms', async () => {
        await serve();
        const client = lineClient();
        const connectedAt = Date.now();
        await until(() => client.lines.length > 0);
        expect(Date.now() - connectedAt).to.be.below(400);
        expect(BroadcastEnvelope.parse(client.lines[0]).workers).to.have.lengthOf(8);
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
        await until(() => center.run.workerIntervalMs === 50);
        expect(logged.some(message => message.startsWith('set_worker_interval_ms → 50 ms (clamped from 10), from TCP client'))).to.equal(true);
        const counted = frames.length;
        await new Promise(resolve => setTimeout(resolve, 600));
        expect(frames.length - counted).to.be.at.least(5);
        telemetry.sendControl(ControlKind.SetNodeIntervalMs, 2000);
        await until(() => center.run.nodeIntervalMs === 2000);
    });

    it('drops a client that falls behind, and keeps serving the others', async function (): Promise<void> {
        this.timeout(15_000);
        await serve({ fidelity: 'full' }, { nodes: 16, workersPerNode: 32 }, { workerIntervalMs: 50, nodeIntervalMs: 1000 }, { maxBufferedBytes: 512 * 1024 });
        const stalled = lineClient();
        stalled.socket.pause();
        const healthy = lineClient();
        // a paused client reads nothing, so it never sees the close itself
        await until(() => logged.some(message => message.endsWith('it fell too far behind')), 12_000);
        expect(center.clients).to.equal(1);
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
        expect(center.fault('malformed-line')).to.equal('Sent a malformed line');
        await until(() => client.lines.length > 2);
        const malformed = client.lines.indexOf('{"version":1,"ts":');
        expect(malformed).to.be.above(0);
        expect(() => BroadcastEnvelope.parse(client.lines[malformed])).to.throw();
        expect(() => BroadcastEnvelope.parse(client.lines[malformed + 1])).not.to.throw();
        expect(center.fault('drop-clients')).to.equal('Dropped 1 client');
        await until(() => client.closed && center.clients === 0);
        const late = lineClient();
        await until(() => late.lines.length > 0);
        expect(center.fault('end-run')).to.equal('Ended the run, as when gempba\'s process exits');
        await until(() => late.closed);
        expect(ended).to.equal(true);
        expect(center.clients).to.equal(0);
    });
});
