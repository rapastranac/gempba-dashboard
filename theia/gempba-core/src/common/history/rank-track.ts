import { RankSnapshot } from '../model/rank-snapshot';
import { CounterRate } from './counter-rate';
import { RingSeries } from './ring-series';
import { CountHistories, RankCount, RankSeries } from './rank-series';

type Counts = Record<RankCount, number>;

/** One rank's rolling history: a ring per series, the frame its next idle time is measured from, and its recent counts. */
export class RankTrack {

    /**
     * Rates are measured over this much of the rank's own time, not between two frames: a rank that finishes a task
     * every few seconds reads a steady rate, rather than 0 with a spike whenever a frame catches one.
     */
    static readonly RATE_WINDOW_MS = 10_000;

    protected readonly cpu: RingSeries;
    protected readonly idlePct: RingSeries;
    protected readonly rssBytes: RingSeries;
    protected readonly totals: Record<RankCount, RingSeries>;
    protected readonly rates: Record<RankCount, RingSeries>;
    protected last: RankSnapshot | undefined;
    /** The counts of its recent frames, on its own clock, oldest first. */
    protected window: { millis: number, counts: Counts }[] = [];

    constructor(capacity: number) {
        this.cpu = new RingSeries(capacity);
        this.idlePct = new RingSeries(capacity);
        this.rssBytes = new RingSeries(capacity);
        this.totals = rings(capacity);
        this.rates = rings(capacity);
    }

    /** Records a frame the rank has not sent before, and returns whether it was one. */
    record(rank: RankSnapshot): boolean {
        const last = this.last;
        if (last?.seqNo === rank.seqNo) {
            return false;
        }
        this.cpu.push(rank.cpuPct);
        this.rssBytes.push(rank.rssBytes);
        const counts = countsOf(rank);
        RankCount.ALL.forEach(count => this.totals[count].push(counts[count]));
        // a lower sequence number means the rank restarted, and its counters with it
        if (last && rank.seqNo > last.seqNo) {
            const idleMicros = CounterRate.perSecond(last.idleMicrosPerThread, rank.idleMicrosPerThread, rank.localMillis - last.localMillis);
            if (idleMicros !== undefined) {
                // idle microseconds per second of wall time, as a percent
                this.idlePct.push(Math.min(idleMicros / 10_000, 100));
            }
            while (this.window.length > 1 && rank.localMillis - this.window[0].millis > RankTrack.RATE_WINDOW_MS) {
                this.window.shift();
            }
            const since = this.window[0];
            const rates = since && ratesBetween(since.counts, counts, rank.localMillis - since.millis);
            if (rates) {
                RankCount.ALL.forEach(count => this.rates[count].push(rates[count]));
            } else {
                this.window = [];
            }
        } else {
            this.window = [];
        }
        this.window.push({ millis: rank.localMillis, counts });
        this.last = rank;
        return true;
    }

    /** Each count in the rank's latest frame; all 0 before any. */
    latestTotals(): Counts {
        return this.last ? countsOf(this.last) : countsOf(undefined);
    }

    /** Each count's newest rate, or `undefined` before the rank sent two frames. */
    latestRates(): Counts | undefined {
        const started = this.rates.tasksStarted.latest();
        return started === undefined ? undefined : Object.fromEntries(RankCount.ALL.map(count => [count, this.rates[count].latest() ?? 0])) as Counts;
    }

    series(): RankSeries {
        return {
            cpu: this.cpu.values(),
            idlePct: this.idlePct.values(),
            rssBytes: this.rssBytes.values(),
            counts: CountHistories.of(count => ({ total: this.totals[count].values(), perSecond: this.rates[count].values() }))
        };
    }
}

function rings(capacity: number): Record<RankCount, RingSeries> {
    return Object.fromEntries(RankCount.ALL.map(count => [count, new RingSeries(capacity)])) as Record<RankCount, RingSeries>;
}

function countsOf(rank: RankSnapshot | undefined): Counts {
    return Object.fromEntries(RankCount.ALL.map(count => [count, rank ? RankCount.of(rank, count) : 0])) as Counts;
}

/**
 * Each count's rate between two readings, or `undefined` when there is none: no time passed, or a counter went back, as when
 * its rank restarts. Tasks run locally are a difference of two counters, which may dip while received tasks wait to start;
 * a dip reads as a rate of 0.
 */
function ratesBetween(previous: Counts, current: Counts, elapsedMillis: number): Counts | undefined {
    const rates = {} as Counts;
    for (const count of RankCount.ALL) {
        const rate = count === 'tasksLocal'
            ? CounterRate.perSecond(0, Math.max(0, current[count] - previous[count]), elapsedMillis)
            : CounterRate.perSecond(previous[count], current[count], elapsedMillis);
        if (rate === undefined) {
            return undefined;
        }
        rates[count] = rate;
    }
    return rates;
}
