import { expect } from 'chai';
import * as net from 'net';
import { BroadcastEnvelope, ControlKind } from '../protocol/wire-protocol';
import { FrameListener } from './frame-listener';
import { TelemetryClient } from './telemetry-client';

const SAMPLE_FRAME = '{"version":2,"ts":1700000000000,"topology":{"nodes":[],"identities":[]},"ranks":[{"rank":0,"seq_no":1,'
    + '"rank_local_ms":0,"tasks_started_total":42,"tasks_sent_total":0,"tasks_recv_total":0,"tasks_running":0,"scheduler_pending_count":0,'
    + '"idle_microseconds_per_thread":0,"process_cpu_pct":0.0,"process_rss_bytes":0,"process_threads":1,"edges_out":[]}],"nodes":[]}';

class RecordingListener implements FrameListener {
    readonly events: string[] = [];
    readonly frames: BroadcastEnvelope[] = [];
    readonly causes: (Error | undefined)[] = [];

    onConnected(): void {
        this.events.push('connected');
    }

    onFrame(frame: BroadcastEnvelope): void {
        this.events.push('frame');
        this.frames.push(frame);
    }

    onDisconnected(cause: Error | undefined): void {
        this.events.push('disconnected');
        this.causes.push(cause);
    }

    count(event: string): number {
        return this.events.filter(e => e === event).length;
    }
}

async function eventually(condition: () => boolean, timeoutMs = 1500): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('condition not met in time');
        }
        await delay(10);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const openPeers = new Set<net.Socket>();

/** A loopback server on an OS-assigned port, so a real gempba on 9000 is never hit. */
async function serve(onConnection: (peer: net.Socket) => void): Promise<net.Server> {
    const server = net.createServer(peer => {
        openPeers.add(peer);
        peer.on('close', () => openPeers.delete(peer));
        peer.on('error', () => undefined);
        onConnection(peer);
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return server;
}

function portOf(server: net.Server): number {
    return (server.address() as net.AddressInfo).port;
}

async function unboundPort(): Promise<number> {
    const server = await serve(() => undefined);
    const port = portOf(server);
    await new Promise(resolve => server.close(resolve));
    return port;
}

describe('TelemetryClient', () => {

    let server: net.Server | undefined;
    let client: TelemetryClient | undefined;

    afterEach(async () => {
        client?.close();
        client = undefined;
        if (server) {
            openPeers.forEach(peer => peer.destroy());
            await new Promise(resolve => server!.close(resolve));
            server = undefined;
        }
    });

    function start(listener: FrameListener, autoReconnect = true): TelemetryClient {
        client = new TelemetryClient('127.0.0.1', portOf(server!), listener, { reconnectBackoffMs: 20, autoReconnect });
        client.start();
        return client;
    }

    it('delivers a parsed frame to the listener', async () => {
        server = await serve(peer => peer.write(SAMPLE_FRAME + '\n'));
        const listener = new RecordingListener();
        start(listener);

        await eventually(() => listener.frames.length === 1);
        expect(listener.frames[0].ranks![0].tasks_started_total).to.equal(42);
    });

    it('fires onConnected before any frames', async () => {
        server = await serve(peer => peer.write(SAMPLE_FRAME + '\n'));
        const listener = new RecordingListener();
        start(listener);

        await eventually(() => listener.frames.length === 1);
        expect(listener.events.slice(0, 2)).to.deep.equal(['connected', 'frame']);
    });

    it('reassembles lines split across TCP chunks and several lines in one chunk', async () => {
        server = await serve(peer => {
            peer.write(SAMPLE_FRAME.slice(0, 40));
            setTimeout(() => peer.write(SAMPLE_FRAME.slice(40) + '\n' + SAMPLE_FRAME + '\r\n'), 30);
        });
        const listener = new RecordingListener();
        start(listener);

        await eventually(() => listener.frames.length === 2);
    });

    it('skips a malformed line without dropping the connection', async () => {
        server = await serve(peer => peer.write('{not json\n\n' + SAMPLE_FRAME + '\n'));
        const listener = new RecordingListener();
        start(listener);

        await eventually(() => listener.frames.length === 1);
        expect(listener.count('disconnected')).to.equal(0);
    });

    it('reconnects after the peer drops the connection', async () => {
        server = await serve(peer => peer.end());
        const listener = new RecordingListener();
        start(listener);

        await eventually(() => listener.count('connected') >= 2);
        expect(listener.causes[0]).to.equal(undefined);
    });

    it('a one-shot client stops after the first disconnect', async () => {
        server = await serve(peer => peer.end());
        const listener = new RecordingListener();
        start(listener, false);

        await eventually(() => listener.count('disconnected') === 1);
        await delay(100);
        expect(listener.events).to.deep.equal(['connected', 'disconnected']);
    });

    it('onDisconnected carries the socket error when the initial connect fails', async () => {
        const listener = new RecordingListener();
        client = new TelemetryClient('127.0.0.1', await unboundPort(), listener, { reconnectBackoffMs: 20 });
        client.start();

        await eventually(() => listener.causes.length >= 1);
        expect(listener.causes[0]).to.be.instanceOf(Error);
        expect((listener.causes[0] as NodeJS.ErrnoException).code).to.equal('ECONNREFUSED');
    });

    it('sendControl writes one JSON line to the server', async () => {
        let received = '';
        server = await serve(peer => peer.on('data', chunk => received += chunk.toString('utf8')));
        const listener = new RecordingListener();
        const telemetry = start(listener);
        await eventually(() => listener.count('connected') === 1);

        expect(telemetry.sendControl(ControlKind.SetWorkerIntervalMs, 2500)).to.equal(true);
        await eventually(() => received.includes('\n'));
        expect(received).to.equal('{"kind":"set_worker_interval_ms","value":2500}\n');
    });

    it('sendControl returns false when not connected', async () => {
        server = await serve(() => undefined);
        client = new TelemetryClient('127.0.0.1', portOf(server), new RecordingListener());
        expect(client.sendControl(ControlKind.SetNodeIntervalMs, 1000)).to.equal(false);
    });

    it('close is safe when start was never called', () => {
        client = new TelemetryClient('127.0.0.1', 12345, new RecordingListener());
        client.close();
    });

    it('fires no callbacks after close', async () => {
        const peers: net.Socket[] = [];
        server = await serve(peer => peers.push(peer));
        const listener = new RecordingListener();
        const telemetry = start(listener);
        await eventually(() => listener.count('connected') === 1 && peers.length === 1);

        telemetry.close();
        peers[0].write(SAMPLE_FRAME + '\n');
        await delay(100);
        expect(listener.events).to.deep.equal(['connected']);
    });
});
