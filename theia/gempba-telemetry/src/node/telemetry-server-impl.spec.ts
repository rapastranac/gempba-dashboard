import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { Container, injectable } from '@theia/core/shared/inversify';
import { ConnectionMode, ConnectionState, SessionSpec, TargetSpec, WorldSnapshot } from '@gempba/core';
import { TelemetryServerClient } from '../common/telemetry-protocol';
import { MockEmitter } from './mock/mock-emitter';
import { TelemetryServerImpl } from './telemetry-server-impl';
import { LocalTunnelProvider } from './tunnel/local-tunnel-provider';
import { Tunnel, TunnelProvider } from './tunnel/tunnel-provider';

class RecordingClient implements TelemetryServerClient {
    readonly snapshots: WorldSnapshot[] = [];
    readonly states: ConnectionState[] = [];
    readonly statuses: string[] = [];

    onSnapshot(snapshot: WorldSnapshot): void {
        this.snapshots.push(snapshot);
    }

    onStateChange(state: ConnectionState): void {
        this.states.push(state);
    }

    onStatus(text: string): void {
        this.statuses.push(text);
    }
}

/** A HOST provider whose open the test settles by hand, standing in for a slow SSH login. */
@injectable()
class ManualHostProvider implements TunnelProvider {
    readonly mode = ConnectionMode.HOST;
    readonly closed: Tunnel[] = [];
    settle: (outcome: Error | undefined) => void = () => undefined;

    open(): Promise<Tunnel> {
        return new Promise((resolve, reject) => {
            this.settle = outcome => {
                if (outcome) {
                    reject(outcome);
                    return;
                }
                const tunnel: Tunnel = { forward: () => Promise.reject(new Error('unused')), close: () => this.closed.push(tunnel) };
                resolve(tunnel);
            };
        });
    }
}

async function eventually(condition: () => boolean, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
        if (Date.now() > deadline) {
            throw new Error('condition not met in time');
        }
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}

describe('TelemetryServerImpl', () => {

    let server: TelemetryServerImpl;
    let client: RecordingClient;
    let host: ManualHostProvider;
    let emitter: MockEmitter | undefined;

    beforeEach(() => {
        // Like Theia's per-window connection container, which binds a ContributionProvider of its own.
        const connection = new Container().createChild();
        bindContributionProvider(connection, Symbol('ConnectionHandler'));
        bindContributionProvider(connection, TunnelProvider);
        connection.bind(TunnelProvider).to(LocalTunnelProvider).inSingletonScope();
        connection.bind(ManualHostProvider).toSelf().inSingletonScope();
        connection.bind(TunnelProvider).toService(ManualHostProvider);
        connection.bind(TelemetryServerImpl).toSelf().inSingletonScope();
        server = connection.get(TelemetryServerImpl);
        host = connection.get(ManualHostProvider);
        client = new RecordingClient();
        server.setClient(client);
    });

    afterEach(async () => {
        server.dispose();
        await emitter?.close();
        emitter = undefined;
    });

    async function listenToMock(): Promise<MockEmitter> {
        emitter = new MockEmitter({ frames: MockEmitter.load(MockEmitter.DEFAULT_FIXTURE), workerIntervalMs: 50 });
        const port = await emitter.listen();
        await server.connect(SessionSpec.local());
        await server.listen(TargetSpec.of(undefined, port));
        return emitter;
    }

    it('lists the modes a tunnel provider is installed for', async () => {
        expect(await server.availableModes()).to.deep.equal([ConnectionMode.LOCAL, ConnectionMode.HOST]);
    });

    it('a LOCAL connect is ready to listen at once', async () => {
        await server.connect(SessionSpec.local());
        expect(client.states).to.deep.equal([ConnectionState.CONNECTING, ConnectionState.CONNECTED]);
    });

    it('rejects a mode without a tunnel provider', async () => {
        const error = await server.connect(SessionSpec.of({ mode: ConnectionMode.JUMP })).catch(e => e);
        expect(error).to.be.instanceOf(Error);
        expect(client.statuses).to.deep.equal(['no JUMP connection support is installed']);
        expect(client.states).to.deep.equal([]);
    });

    it('rejects listening before connecting', async () => {
        const error = await server.listen(TargetSpec.of(undefined, 9000)).catch(e => e);
        expect(error).to.be.instanceOf(Error);
    });

    it('streams mapped snapshots from the target', async () => {
        await listenToMock();
        await eventually(() => client.snapshots.length >= 2);
        expect(client.states.at(-1)).to.equal(ConnectionState.LISTENING);
        expect(client.snapshots[0].nodes.map(node => node.host)).to.deep.equal(['alpha', 'beta', '(unknown host)']);
        expect(client.snapshots[1].nodes.map(node => node.host)).to.deep.equal(['alpha', 'beta', '(unknown host)']);
        expect(client.statuses.some(text => text.startsWith('connected to 127.0.0.1:'))).to.equal(true);
    });

    it('sends the saved rates on connect and new rates while streaming', async () => {
        await server.pushRates(200, 2000);
        const mock = await listenToMock();
        await eventually(() => mock.workerIntervalMs === 200 && mock.nodeIntervalMs === 2000);

        await server.pushRates(300, 3000);
        await eventually(() => mock.workerIntervalMs === 300 && mock.nodeIntervalMs === 3000);
        expect(client.statuses.at(-1)).to.equal('rates pushed (worker=300 ms, node=3000 ms)');
    });

    it('stop keeps the session open and ends the stream', async () => {
        await listenToMock();
        await eventually(() => client.snapshots.length >= 1);
        await server.stop();
        const received = client.snapshots.length;
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(client.snapshots.length).to.equal(received);
        expect(client.states.at(-1)).to.equal(ConnectionState.CONNECTED);
    });

    it('disconnect ends the session', async () => {
        await listenToMock();
        await server.disconnect();
        expect(client.states.at(-1)).to.equal(ConnectionState.DISCONNECTED);
        expect(await server.listen(TargetSpec.of(undefined, 9000)).catch(e => e)).to.be.instanceOf(Error);
    });

    it('closes a tunnel that opens after the session was abandoned', async () => {
        const connecting = server.connect(SessionSpec.of({ mode: ConnectionMode.HOST, host: 'me@vm' }));
        await server.disconnect();
        host.settle(undefined);
        await connecting;
        expect(host.closed).to.have.lengthOf(1);
        expect(client.states.at(-1)).to.equal(ConnectionState.DISCONNECTED);
    });

    it('a failed open rejects and returns to disconnected', async () => {
        const connecting = server.connect(SessionSpec.of({ mode: ConnectionMode.HOST, host: 'me@vm' }));
        host.settle(new Error('auth failed'));
        expect(await connecting.catch(e => e)).to.be.instanceOf(Error);
        expect(client.states).to.deep.equal([ConnectionState.CONNECTING, ConnectionState.DISCONNECTED]);
        expect(client.statuses.at(-1)).to.equal('connection failed: auth failed');
    });
});
