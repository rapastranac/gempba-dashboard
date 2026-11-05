import { ContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { Disposable } from '@theia/core/lib/common/disposable';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ConnectionMode, ConnectionState, RefreshInterval, SessionSpec, TargetSpec } from '@gempba/core';
import { TelemetryServer, TelemetryServerClient } from '../common/telemetry-protocol';
import { FrameListener } from './client/frame-listener';
import { TelemetryClient } from './client/telemetry-client';
import { ControlKind } from './protocol/wire-protocol';
import { TelemetryStore } from './telemetry/telemetry-store';
import { Forward, Tunnel, TunnelProvider } from './tunnel/tunnel-provider';

/**
 * One frontend's telemetry session: opens a tunnel through the provider for the session's mode, streams the
 * target over TCP, maps every frame and notifies the frontend. Every teardown bumps an epoch, so callbacks
 * and pending opens from a superseded session are dropped.
 * A local gempba needs no session: listening while disconnected streams it directly, and stopping that stream
 * disconnects. Connect is for the modes that authenticate. An SSH session that drops on its own cannot recover
 * without authenticating again, so it disconnects and says so instead of retrying the stream.
 */
@injectable()
export class TelemetryServerImpl implements TelemetryServer {

    /** gempba's telemetry server, on rank 0, binds loopback only; a tunnel's local end is loopback too. */
    static readonly LOOPBACK = '127.0.0.1';

    @inject(ContributionProvider) @named(TunnelProvider)
    protected readonly tunnelProviders: ContributionProvider<TunnelProvider>;

    protected client: TelemetryServerClient | undefined;
    protected state = ConnectionState.DISCONNECTED;
    protected epoch = 0;
    protected tunnel: Tunnel | undefined;
    protected tunnelWatch: Disposable | undefined;
    protected sessionMode: ConnectionMode | undefined;
    protected sessionHost: string | undefined;
    protected forward: Forward | undefined;
    protected telemetry: TelemetryClient | undefined;
    protected readonly store = new TelemetryStore();
    protected workerIntervalMs = RefreshInterval.DEFAULT_WORKER_MS;
    protected nodeIntervalMs = RefreshInterval.DEFAULT_NODE_MS;

    setClient(client: TelemetryServerClient | undefined): void {
        this.client = client;
    }

    getClient(): TelemetryServerClient | undefined {
        return this.client;
    }

    async availableModes(): Promise<ConnectionMode[]> {
        return this.tunnelProviders.getContributions().map(provider => provider.mode);
    }

    async connect(session: SessionSpec): Promise<void> {
        this.teardown();
        const provider = this.tunnelProviders.getContributions().find(candidate => candidate.mode === session.mode);
        if (!provider) {
            this.setState(ConnectionState.DISCONNECTED);
            throw this.fail(`no ${session.mode} connection support is installed`);
        }
        const epoch = this.epoch;
        this.setState(ConnectionState.CONNECTING);
        let tunnel: Tunnel;
        try {
            tunnel = await provider.open(session);
        } catch (error) {
            if (epoch === this.epoch) {
                this.setState(ConnectionState.DISCONNECTED);
            }
            throw this.fail(`connection failed: ${messageOf(error)}`);
        }
        if (epoch !== this.epoch) {
            tunnel.close();
            return;
        }
        this.adopt(tunnel, session);
        this.setState(ConnectionState.CONNECTED);
        this.status(session.mode === ConnectionMode.LOCAL ? 'ready to listen locally' : `connected to ${session.host}`);
    }

    /** Streams the target over the open session, or straight from this machine when there is none. */
    async listen(target: TargetSpec): Promise<void> {
        this.stopListening();
        const epoch = this.epoch;
        const tunnel = this.tunnel ?? await this.openLocal();
        if (epoch !== this.epoch) {
            return;
        }
        let forward: Forward;
        try {
            forward = await tunnel.forward(target);
        } catch (error) {
            if (epoch === this.epoch) {
                this.endStream();
            }
            throw this.fail(`cannot reach the target: ${messageOf(error)}`);
        }
        if (epoch !== this.epoch) {
            forward.close();
            return;
        }
        this.forward = forward;
        this.store.reset();
        const address = `${TelemetryServerImpl.LOOPBACK}:${forward.port}`;
        this.telemetry = new TelemetryClient(TelemetryServerImpl.LOOPBACK, forward.port, this.frameListener(epoch, address));
        this.setState(ConnectionState.LISTENING);
        this.status(`connecting to ${address}…`);
        this.telemetry.start();
    }

    async stop(): Promise<void> {
        if (this.state !== ConnectionState.LISTENING) {
            return;
        }
        this.endStream();
        this.status('stopped listening');
    }

    /** A local session exists only for its stream; an authenticated one stays open for the next target. */
    protected endStream(): void {
        if (this.sessionMode === ConnectionMode.LOCAL) {
            this.teardown();
            this.setState(ConnectionState.DISCONNECTED);
        } else {
            this.stopListening();
            this.setState(ConnectionState.CONNECTED);
        }
    }

    protected async openLocal(): Promise<Tunnel> {
        const provider = this.tunnelProviders.getContributions().find(candidate => candidate.mode === ConnectionMode.LOCAL);
        if (!provider) {
            throw this.fail('no LOCAL connection support is installed');
        }
        const session = SessionSpec.local();
        const tunnel = await provider.open(session);
        this.adopt(tunnel, session);
        return tunnel;
    }

    /** Makes the tunnel the current session's, watching for it to end on its own. */
    protected adopt(tunnel: Tunnel, session: SessionSpec): void {
        this.tunnel = tunnel;
        this.sessionMode = session.mode;
        this.sessionHost = session.host;
        this.tunnelWatch = tunnel.onClose(cause => this.sessionDropped(tunnel, cause));
    }

    /** Nothing can stream over a dropped session until the user connects, and authenticates, again. */
    protected sessionDropped(tunnel: Tunnel, cause: Error | undefined): void {
        if (tunnel !== this.tunnel) {
            return;
        }
        const host = this.sessionHost;
        this.teardown();
        this.setState(ConnectionState.DISCONNECTED);
        this.status(`SSH session to ${host} closed (${cause ? cause.message : 'the server ended it'}); connect again`);
    }

    async disconnect(): Promise<void> {
        const wasConnected = this.state !== ConnectionState.DISCONNECTED;
        this.teardown();
        if (wasConnected) {
            this.setState(ConnectionState.DISCONNECTED);
            this.status('disconnected');
        }
    }

    async pushRates(workerIntervalMs: number, nodeIntervalMs: number): Promise<void> {
        this.workerIntervalMs = workerIntervalMs;
        this.nodeIntervalMs = nodeIntervalMs;
        const rates = `worker=${workerIntervalMs} ms, node=${nodeIntervalMs} ms`;
        if (!this.telemetry) {
            this.status(`rates saved (${rates}); they are sent on the next connect`);
        } else if (this.sendRates(this.telemetry)) {
            this.status(`rates pushed (${rates})`);
        } else {
            this.status('rates not sent, the connection is down; they are sent on reconnect');
        }
    }

    dispose(): void {
        this.teardown();
        this.client = undefined;
    }

    protected frameListener(epoch: number, address: string): FrameListener {
        return {
            onConnected: () => {
                if (epoch === this.epoch && this.telemetry) {
                    this.sendRates(this.telemetry);
                    this.status(`connected to ${address}`);
                }
            },
            onFrame: frame => {
                if (epoch === this.epoch) {
                    this.client?.onSnapshot(this.store.ingest(frame));
                }
            },
            onDisconnected: cause => {
                if (epoch === this.epoch) {
                    this.status(`disconnected from ${address} (${cause ? cause.message : 'peer closed'}); retrying…`);
                }
            }
        };
    }

    protected sendRates(telemetry: TelemetryClient): boolean {
        const rank = telemetry.sendControl(ControlKind.SetWorkerIntervalMs, this.workerIntervalMs);
        const node = telemetry.sendControl(ControlKind.SetNodeIntervalMs, this.nodeIntervalMs);
        return rank && node;
    }

    protected stopListening(): void {
        this.epoch++;
        this.telemetry?.close();
        this.telemetry = undefined;
        this.forward?.close();
        this.forward = undefined;
    }

    protected teardown(): void {
        this.stopListening();
        this.tunnelWatch?.dispose();
        this.tunnelWatch = undefined;
        this.tunnel?.close();
        this.tunnel = undefined;
        this.sessionMode = undefined;
        this.sessionHost = undefined;
    }

    protected setState(state: ConnectionState): void {
        if (this.state !== state) {
            this.state = state;
            this.client?.onStateChange(state);
        }
    }

    protected status(text: string): void {
        this.client?.onStatus(text);
    }

    protected fail(text: string): Error {
        this.status(text);
        return new Error(text);
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
