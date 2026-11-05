import { Emitter } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import {
    ConnectionMode, ConnectionState, FrameArrivals, FrameCadence, NodeHistoryStore, RankHistoryStore, SessionSpec, StreamCondition, StreamLink,
    TargetSpec, WorldSnapshot
} from '@gempba/core';
import { TelemetryServer } from '../common/telemetry-protocol';
import { ObservedIntervals, TelemetryService } from '../common/telemetry-service';
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
    protected readonly onIntervalChangeEmitter = new Emitter<number>();
    protected readonly onLinkChangeEmitter = new Emitter<StreamLink | undefined>();
    protected readonly onClearEmitter = new Emitter<void>();
    readonly onSnapshot = this.onSnapshotEmitter.event;
    readonly onStateChange = this.onStateChangeEmitter.event;
    readonly onStatus = this.onStatusEmitter.event;
    readonly onIntervalChange = this.onIntervalChangeEmitter.event;
    readonly onLinkChange = this.onLinkChangeEmitter.event;
    readonly onClear = this.onClearEmitter.event;

    protected currentState = ConnectionState.DISCONNECTED;
    protected latestSnapshot: WorldSnapshot | undefined;
    protected latestStatus = '';
    protected readonly rankCadence = new FrameCadence();
    protected readonly nodeCadence = new FrameCadence();
    protected readonly nodeArrivals = new FrameArrivals();
    protected latestFrameAt: number | undefined;
    protected latestLineAt: number | undefined;
    protected runId: string | undefined;
    protected currentLink: StreamLink | undefined;

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

    get link(): StreamLink | undefined {
        return this.currentLink;
    }

    get condition(): StreamCondition | undefined {
        return StreamCondition.of({ state: this.currentState, link: this.currentLink, snapshot: this.latestSnapshot });
    }

    get intervalMs(): number {
        return this.rateSettings.intervalMs;
    }

    get observedIntervals(): ObservedIntervals {
        return { rankMs: this.rankCadence.medianMs(), nodeMs: this.nodeCadence.medianMs() };
    }

    @postConstruct()
    protected init(): void {
        this.receiver.snapshots(snapshot => {
            if (snapshot.runId !== '' && this.runId !== undefined && snapshot.runId !== this.runId) {
                // gempba restarted on the same port: its charts start afresh, as a new Listen's do
                this.forget();
            }
            this.runId = snapshot.runId || this.runId;
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
        this.receiver.links(link => this.setLink(link));
        this.receiver.statuses(text => {
            this.latestStatus = text;
            this.onStatusEmitter.fire(text);
        });
        this.rateSettings.onChange(intervalMs => {
            this.onIntervalChangeEmitter.fire(intervalMs);
            // a failed send leaves the rate in the backend, which sends it on the next connect
            this.sendInterval().catch(() => undefined);
        });
    }

    nodeFrameAt(host: string): number | undefined {
        return this.nodeArrivals.lastAt(host);
    }

    availableModes(): Promise<ConnectionMode[]> {
        return this.server.availableModes();
    }

    async connect(session: SessionSpec): Promise<void> {
        await this.sendInterval();
        return this.server.connect(session);
    }

    async listen(target: TargetSpec): Promise<void> {
        this.runId = undefined;
        this.setLink(undefined);
        this.clear();
        await this.sendInterval();
        return this.server.listen(target);
    }

    stop(): Promise<void> {
        return this.server.stop();
    }

    disconnect(): Promise<void> {
        return this.server.disconnect();
    }

    clear(): void {
        this.forget();
        this.onClearEmitter.fire();
    }

    setIntervalMs(intervalMs: number): Promise<void> {
        return this.rateSettings.set(intervalMs);
    }

    /** Hands the backend the rate as set, which it sends to gempba now if a stream is open, and on every (re)connect. */
    protected async sendInterval(): Promise<void> {
        await this.rateSettings.ready;
        await this.server.pushInterval(this.rateSettings.intervalMs);
    }

    /** Clears what the last stream or run left: the snapshot, the histories, the observed rates and the frame times. */
    protected forget(): void {
        this.nodeHistory.clear();
        this.rankHistory.clear();
        this.rankCadence.clear();
        this.nodeCadence.clear();
        this.nodeArrivals.clear();
        this.latestFrameAt = undefined;
        this.latestLineAt = undefined;
        this.latestSnapshot = undefined;
    }

    protected setLink(link: StreamLink | undefined): void {
        if (this.currentLink !== link) {
            this.currentLink = link;
            this.onLinkChangeEmitter.fire(link);
        }
    }

    protected observe(snapshot: WorldSnapshot, now: number): void {
        for (const node of snapshot.nodes) {
            if (node.hasLiveMemory) {
                this.nodeCadence.record(node.host, node.sentinelLocalMillis, node.sentinelLocalMillis);
            }
            for (const socket of node.sockets) {
                for (const rank of socket.ranks) {
                    this.rankCadence.record(String(rank.id), rank.seqNo, rank.localMillis);
                    this.nodeArrivals.record(node.host, String(rank.id), rank.seqNo, now);
                }
            }
        }
    }
}
