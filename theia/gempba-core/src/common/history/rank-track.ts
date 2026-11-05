import { RankSnapshot } from '../model/rank-snapshot';
import { CounterRate } from './counter-rate';
import { RingSeries } from './ring-series';
import { RankSeries } from './rank-series';

/** One rank's rolling history: a ring per series, the frame its next idle time is measured from, and its recent task counts. */
export class RankTrack {

    /**
     * Tasks per second are measured over this much of the rank's own time, not between two frames: a rank that
     * finishes a task every few seconds reads a steady rate, rather than 0 with a spike whenever a frame catches one.
     */
    static readonly RATE_WINDOW_MS = 10_000;

    protected readonly cpu: RingSeries;
    protected readonly tasksPerSecond: RingSeries;
    protected readonly idlePct: RingSeries;
    protected readonly rssBytes: RingSeries;
    protected last: RankSnapshot | undefined;
    /** The task counts of its recent frames, on its own clock, oldest first. */
    protected counts: { millis: number, tasks: number }[] = [];

    constructor(capacity: number) {
        this.cpu = new RingSeries(capacity);
        this.tasksPerSecond = new RingSeries(capacity);
        this.idlePct = new RingSeries(capacity);
        this.rssBytes = new RingSeries(capacity);
    }

    /** Records a frame the rank has not sent before, and returns whether it was one. */
    record(rank: RankSnapshot): boolean {
        const last = this.last;
        if (last?.seqNo === rank.seqNo) {
            return false;
        }
        this.cpu.push(rank.cpuPct);
        this.rssBytes.push(rank.rssBytes);
        // a lower sequence number means the rank restarted, and its counters with it
        if (last && rank.seqNo > last.seqNo) {
            const idleMicros = CounterRate.perSecond(last.idleMicrosPerThread, rank.idleMicrosPerThread, rank.localMillis - last.localMillis);
            if (idleMicros !== undefined) {
                // idle microseconds per second of wall time, as a percent
                this.idlePct.push(Math.min(idleMicros / 10_000, 100));
            }
            while (this.counts.length > 1 && rank.localMillis - this.counts[0].millis > RankTrack.RATE_WINDOW_MS) {
                this.counts.shift();
            }
            const since = this.counts[0];
            const tasks = since && CounterRate.perSecond(since.tasks, rank.tasksStartedTotal, rank.localMillis - since.millis);
            if (tasks !== undefined) {
                this.tasksPerSecond.push(tasks);
            } else {
                this.counts = [];
            }
        } else {
            this.counts = [];
        }
        this.counts.push({ millis: rank.localMillis, tasks: rank.tasksStartedTotal });
        this.last = rank;
        return true;
    }

    /** The newest tasks-per-second rate, or `undefined` before the rank sent two frames. */
    latestTasksPerSecond(): number | undefined {
        return this.tasksPerSecond.latest();
    }

    series(): RankSeries {
        return {
            cpu: this.cpu.values(),
            tasksPerSecond: this.tasksPerSecond.values(),
            idlePct: this.idlePct.values(),
            rssBytes: this.rssBytes.values()
        };
    }
}
