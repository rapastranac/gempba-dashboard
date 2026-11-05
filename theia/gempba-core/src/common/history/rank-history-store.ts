import { WorldSnapshot } from '../model/world-snapshot';
import { RingSeries } from './ring-series';
import { RankSeries } from './rank-series';
import { RankTrack } from './rank-track';

/**
 * Per-rank rolling history with live rates, and the throughput of each node and of the whole run; the telemetry
 * stream itself keeps none. The frames repeat a rank's latest sample until it sends a new one, so only a frame with
 * a new sequence number adds a sample. Ranks and nodes that leave the frames are dropped.
 */
export class RankHistoryStore {

    /** Samples kept per series: one minute at the default 500 ms between a rank's frames. */
    static readonly CAPACITY = 120;

    protected readonly tracks = new Map<number, RankTrack>();
    protected readonly throughputByHost = new Map<string, RingSeries>();
    protected readonly throughputOfCluster = new RingSeries(RankHistoryStore.CAPACITY);

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
                for (const rank of socket.ranks) {
                    seen.add(rank.id);
                    const track = this.trackOf(rank.id);
                    changed = track.record(rank) || changed;
                    const rate = track.latestTasksPerSecond();
                    if (rate !== undefined) {
                        total += rate;
                        rated = true;
                    }
                }
            }
            // a node adds a sample when one of its ranks sent a new frame, once one of them has a rate
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

    seriesFor(id: number): RankSeries {
        return this.tracks.get(id)?.series() ?? RankSeries.empty();
    }

    /** Tasks started per second by all of one node's ranks, oldest first. */
    throughputFor(host: string): readonly number[] {
        return this.throughputByHost.get(host)?.values() ?? [];
    }

    /** Tasks started per second by every rank, oldest first. */
    clusterThroughput(): readonly number[] {
        return this.throughputOfCluster.values();
    }

    /** Ranks with a history, in first-seen order. */
    ranks(): readonly number[] {
        return [...this.tracks.keys()];
    }

    clear(): void {
        this.tracks.clear();
        this.throughputByHost.clear();
        this.throughputOfCluster.clear();
    }

    protected trackOf(id: number): RankTrack {
        let track = this.tracks.get(id);
        if (!track) {
            track = new RankTrack(RankHistoryStore.CAPACITY);
            this.tracks.set(id, track);
        }
        return track;
    }

    protected throughputRingOf(host: string): RingSeries {
        let ring = this.throughputByHost.get(host);
        if (!ring) {
            ring = new RingSeries(RankHistoryStore.CAPACITY);
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
