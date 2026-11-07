import { WorldSnapshot } from '../model/world-snapshot';
import { RingSeries } from './ring-series';
import { CountHistories, RankCount, RankSeries } from './rank-series';
import { RankTrack } from './rank-track';

/** One node's sums of its ranks' counts, as running totals and as rates. */
interface NodeCounts {
    readonly totals: Record<RankCount, RingSeries>;
    readonly rates: Record<RankCount, RingSeries>;
}

/**
 * Per-rank rolling history with live rates, each node's sums of its ranks' counts, and the throughput of the whole run;
 * the telemetry stream itself keeps none. The frames repeat a rank's latest sample until it sends a new one, so only a
 * frame with a new sequence number adds a sample. Ranks and nodes that leave the frames are dropped.
 */
export class RankHistoryStore {

    /** Samples kept per series: one minute at the default 500 ms between a rank's frames. */
    static readonly CAPACITY = 120;

    protected readonly tracks = new Map<number, RankTrack>();
    protected readonly nodeCounts = new Map<string, NodeCounts>();
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
            const totals = zeros();
            const rates = zeros();
            let rated = false;
            let changed = false;
            for (const socket of node.sockets) {
                for (const rank of socket.ranks) {
                    seen.add(rank.id);
                    const track = this.trackOf(rank.id);
                    changed = track.record(rank) || changed;
                    const rankTotals = track.latestTotals();
                    const rankRates = track.latestRates();
                    rated = rated || rankRates !== undefined;
                    // a count that means nothing on a rank, such as tasks run locally on a coordinator, stays out of its node's sum
                    for (const count of RankCount.ALL.filter(each => RankCount.applies(rank, each))) {
                        totals[count] += rankTotals[count];
                        rates[count] += rankRates?.[count] ?? 0;
                    }
                }
            }
            // a node adds a sample when one of its ranks sent a new frame, and a rate once one of them has a rate
            if (changed) {
                const counts = this.countsOf(node.host);
                RankCount.ALL.forEach(count => counts.totals[count].push(totals[count]));
                if (rated) {
                    RankCount.ALL.forEach(count => counts.rates[count].push(rates[count]));
                    clusterChanged = true;
                }
            }
            clusterTotal += rates.tasksStarted;
        }
        if (clusterChanged) {
            this.throughputOfCluster.push(clusterTotal);
        }
        dropMissing(this.tracks, seen);
        dropMissing(this.nodeCounts, hosts);
    }

    seriesFor(id: number): RankSeries {
        return this.tracks.get(id)?.series() ?? RankSeries.empty();
    }

    /** Tasks started per second by all of one node's ranks, oldest first. */
    throughputFor(host: string): readonly number[] {
        return this.nodeCounts.get(host)?.rates.tasksStarted.values() ?? [];
    }

    /** One node's sums of its ranks' counts, as running totals and as rates, oldest first; tasks run locally leave out a coordinator. */
    countsFor(host: string): CountHistories {
        const counts = this.nodeCounts.get(host);
        return counts ? CountHistories.of(count => ({ total: counts.totals[count].values(), perSecond: counts.rates[count].values() })) : CountHistories.empty();
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
        this.nodeCounts.clear();
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

    protected countsOf(host: string): NodeCounts {
        let counts = this.nodeCounts.get(host);
        if (!counts) {
            counts = { totals: rings(), rates: rings() };
            this.nodeCounts.set(host, counts);
        }
        return counts;
    }
}

function zeros(): Record<RankCount, number> {
    return Object.fromEntries(RankCount.ALL.map(count => [count, 0])) as Record<RankCount, number>;
}

function rings(): Record<RankCount, RingSeries> {
    return Object.fromEntries(RankCount.ALL.map(count => [count, new RingSeries(RankHistoryStore.CAPACITY)])) as Record<RankCount, RingSeries>;
}

function dropMissing<K>(map: Map<K, unknown>, kept: ReadonlySet<K>): void {
    for (const key of [...map.keys()]) {
        if (!kept.has(key)) {
            map.delete(key);
        }
    }
}
