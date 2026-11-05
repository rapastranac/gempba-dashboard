import { Emitter } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    ConnectionMode, ConnectionState, FrameArrivals, FrameCadence, NodeHistoryStore, RefreshRates, SessionSpec, TargetSpec, RankHistoryStore, WorldSnapshot
} from '@gempba/core';
import { TelemetryServer } from '../common/telemetry-protocol';
import { TelemetryService } from '../common/telemetry-service';
import { RateSettings } from './rate-settings';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';

@injectable()
export class TelemetryServiceImpl implements TelemetryService {

    @inject(TelemetryServer) protected readonly server: TelemetryServer;
    @inject(TelemetryServerClientImpl) protected readonly receiver: TelemetryServerClientImpl;
    @inject(NodeHistoryStore) protected readonly nodeHistory: NodeHistoryStore;
    @inject(RankHistoryStore) protected readonly rankHistory: RankHistoryStore;
    @inject(RateSettings) protected readonly rateSettings: RateSettings;

    protected readonly onSnapshotEmitter = new Emitter<WorldSnapshot>();
    protected readonly onStateChangeEmitter = new Emitter<ConnectionState>();
    protected readonly onStatusEmitter = new Emitter<string>();
    protected readonly onRatesChangeEmitter = new Emitter<RefreshRates>();
    readonly onSnapshot = this.onSnapshotEmitter.event;
    readonly onStateChange = this.onStateChangeEmitter.event;
    readonly onStatus = this.onStatusEmitter.event;
    readonly onRatesChange = this.onRatesChangeEmitter.event;

    protected currentState = ConnectionState.DISCONNECTED;
    protected latestSnapshot: WorldSnapshot | undefined;
    protected latestStatus = '';
    protected readonly workerCadence = new FrameCadence();
    protected readonly nodeCadence = new FrameCadence();
    protected readonly nodeArrivals = new FrameArrivals();
    protected latestFrameAt: number | undefined;
    protected latestLineAt: number | undefined;
    protected runId: string | undefined;

    get state(): ConnectionState {
        return this.currentState;
    }

    get snapshot(): WorldSnapshot | undefined {
        return this.latestSnapshot;
    }

    get lastFrameAt(): number | undefined {
        return this.latestFrameAt;
    }

    get lastLineAt(): number | undefined {
        return this.latestLineAt;
    }

    get status(): string {
        return this.latestStatus;
    }

    get rates(): RefreshRates {
        return this.rateSettings.rates;
    }

    get observedRates(): Partial<RefreshRates> {
        return { workerIntervalMs: this.workerCadence.medianMs(), nodeIntervalMs: this.nodeCadence.medianMs() };
    }

    @postConstruct()
    protected init(): void {
        this.receiver.snapshots(snapshot => {
            if (snapshot.runId !== undefined && this.runId !== undefined && snapshot.runId !== this.runId) {
                // gempba restarted on the same port: its charts start afresh, as a new Listen's do
                this.forget();
            }
            this.runId = snapshot.runId ?? this.runId;
            const now = Date.now();
            this.latestLineAt = now;
            if (!snapshot.headerOnly) {
                this.nodeHistory.update(snapshot);
                this.rankHistory.update(snapshot);
                this.observe(snapshot, now);
                this.latestFrameAt = now;
            }
            this.latestSnapshot = snapshot;
            this.onSnapshotEmitter.fire(snapshot);
        });
        this.receiver.stateChanges(state => {
            this.currentState = state;
            this.onStateChangeEmitter.fire(state);
        });
        this.receiver.statuses(text => {
            this.latestStatus = text;
            this.onStatusEmitter.fire(text);
        });
        this.rateSettings.onChange(rates => {
            this.onRatesChangeEmitter.fire(rates);
            // a failed send leaves the rates in the backend, which sends them on the next connect
            this.sendRates().catch(() => undefined);
        });
    }

    nodeFrameAt(host: string): number | undefined {
        return this.nodeArrivals.lastAt(host);
    }

    availableModes(): Promise<ConnectionMode[]> {
        return this.server.availableModes();
    }

    async connect(session: SessionSpec): Promise<void> {
        await this.sendRates();
        return this.server.connect(session);
    }

    async listen(target: TargetSpec): Promise<void> {
        this.forget();
        this.runId = undefined;
        await this.sendRates();
        return this.server.listen(target);
    }

    stop(): Promise<void> {
        return this.server.stop();
    }

    disconnect(): Promise<void> {
        return this.server.disconnect();
    }

    setRates(rates: Partial<RefreshRates>): Promise<void> {
        return this.rateSettings.set(rates);
    }

    /** Hands the backend the rates as set, which it sends to gempba now if a stream is open, and on every (re)connect. */
    protected async sendRates(): Promise<void> {
        await this.rateSettings.ready;
        const rates = this.rateSettings.rates;
        await this.server.pushRates(rates.workerIntervalMs, rates.nodeIntervalMs);
    }

    /** Clears what the last stream or run left: the snapshot, the histories, the observed rates and the frame times. */
    protected forget(): void {
        this.nodeHistory.clear();
        this.rankHistory.clear();
        this.workerCadence.clear();
        this.nodeCadence.clear();
        this.nodeArrivals.clear();
        this.latestFrameAt = undefined;
        this.latestLineAt = undefined;
        this.latestSnapshot = undefined;
    }

    protected observe(snapshot: WorldSnapshot, now: number): void {
        for (const node of snapshot.nodes) {
            if (node.hasLiveMemory) {
                this.nodeCadence.record(node.host, node.sentinelLocalMillis, node.sentinelLocalMillis);
            }
            for (const socket of node.sockets) {
                for (const rank of socket.ranks) {
                    this.workerCadence.record(String(rank.id), rank.seqNo, rank.localMillis);
                    this.nodeArrivals.record(node.host, String(rank.id), rank.seqNo, now);
                }
            }
        }
    }
}
