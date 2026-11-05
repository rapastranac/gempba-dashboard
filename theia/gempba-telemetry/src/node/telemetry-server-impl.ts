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
 * without authenticating again, so it disconnects and says so instead of retrying the stream. A stream that closes
 * after the run's final line says the run ended, and waits for the next run on the same port.
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
    /** Whether the stream's latest line was the run's final one: gempba closes the connection after it. */
    protected runEnded = false;
    protected intervalMs = RefreshInterval.DEFAULT_MS;

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
        this.runEnded = false;
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

    async pushInterval(intervalMs: number): Promise<void> {
        this.intervalMs = intervalMs;
        const rate = RefreshInterval.label(intervalMs);
        if (!this.telemetry) {
            this.status(`refresh rate saved (${rate}); it is sent on the next connect`);
        } else if (this.sendInterval(this.telemetry)) {
            this.status(`refresh rate pushed (${rate})`);
        } else {
            this.status('refresh rate not sent, the connection is down; it is sent on reconnect');
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
                    this.sendInterval(this.telemetry);
                    this.status(`connected to ${address}`);
                }
            },
            onFrame: frame => {
                if (epoch === this.epoch) {
                    const snapshot = this.store.ingest(frame);
                    this.runEnded = snapshot.final === true;
                    this.client?.onSnapshot(snapshot);
                }
            },
            onDisconnected: cause => {
                if (epoch !== this.epoch) {
                    return;
                }
                // schema 1 has no final line, so a gempba 4.2 run that ends reads as a lost connection
                this.status(this.runEnded
                    ? `the run ended; waiting for the next run on ${address}`
                    : `disconnected from ${address} (${cause ? cause.message : 'peer closed'}); retrying…`);
            }
        };
    }

    /** Sends the rate as `set_interval_ms`, the one interval gempba v4.3.0 drives every frame and its broadcast at. */
    protected sendInterval(telemetry: TelemetryClient): boolean {
        return telemetry.sendControl(ControlKind.SetIntervalMs, this.intervalMs);
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
