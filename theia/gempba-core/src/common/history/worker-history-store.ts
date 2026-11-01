import { WorldSnapshot } from '../model/world-snapshot';
import { RingSeries } from './ring-series';
import { WorkerSeries } from './worker-series';
import { WorkerTrack } from './worker-track';

/**
 * Per-worker rolling history with live rates, and the throughput of each node and of the whole run; the telemetry
 * stream itself keeps none. The frames repeat a worker's latest sample until it sends a new one, so only a frame with
 * a new sequence number adds a sample. Workers and nodes that leave the frames are dropped.
 */
export class WorkerHistoryStore {

    /** Samples kept per series: one minute at the default 500 ms worker cadence. */
    static readonly CAPACITY = 120;

    protected readonly tracks = new Map<number, WorkerTrack>();
    protected readonly throughputByHost = new Map<string, RingSeries>();
    protected readonly throughputOfCluster = new RingSeries(WorkerHistoryStore.CAPACITY);

    update(snapshot: WorldSnapshot | undefined): void {
        if (!snapshot) {
            return;
        }
        const seen = new Set<number>();
        const hosts = new Set<string>();
        let clusterTotal = 0;
        let clusterChanged = false;
        for (const node of snapshot.nodes) {
            hosts.add(node.host);
            let total = 0;
            let rated = false;
            let changed = false;
            for (const socket of node.sockets) {
                for (const worker of socket.workers) {
                    seen.add(worker.workerId);
                    const track = this.trackOf(worker.workerId);
                    changed = track.record(worker) || changed;
                    const rate = track.latestTasksPerSecond();
                    if (rate !== undefined) {
                        total += rate;
                        rated = true;
                    }
                }
            }
            // a node adds a sample when one of its workers sent a new frame, once one of them has a rate
            if (changed && rated) {
                this.throughputRingOf(node.host).push(total);
                clusterChanged = true;
            }
            clusterTotal += total;
        }
        if (clusterChanged) {
            this.throughputOfCluster.push(clusterTotal);
        }
        dropMissing(this.tracks, seen);
        dropMissing(this.throughputByHost, hosts);
    }

    seriesFor(workerId: number): WorkerSeries {
        return this.tracks.get(workerId)?.series() ?? WorkerSeries.empty();
    }

    /** Tasks started per second by all of one node's workers, oldest first. */
    throughputFor(host: string): readonly number[] {
        return this.throughputByHost.get(host)?.values() ?? [];
    }

    /** Tasks started per second by every worker, oldest first. */
    clusterThroughput(): readonly number[] {
        return this.throughputOfCluster.values();
    }

    /** Workers with a history, in first-seen order. */
    workerIds(): readonly number[] {
        return [...this.tracks.keys()];
    }

    clear(): void {
        this.tracks.clear();
        this.throughputByHost.clear();
        this.throughputOfCluster.clear();
    }

    protected trackOf(workerId: number): WorkerTrack {
        let track = this.tracks.get(workerId);
        if (!track) {
            track = new WorkerTrack(WorkerHistoryStore.CAPACITY);
            this.tracks.set(workerId, track);
        }
        return track;
    }

    protected throughputRingOf(host: string): RingSeries {
        let ring = this.throughputByHost.get(host);
        if (!ring) {
            ring = new RingSeries(WorkerHistoryStore.CAPACITY);
            this.throughputByHost.set(host, ring);
        }
        return ring;
    }
}

function dropMissing<K>(map: Map<K, unknown>, kept: ReadonlySet<K>): void {
    for (const key of [...map.keys()]) {
        if (!kept.has(key)) {
            map.delete(key);
        }
    }
}
