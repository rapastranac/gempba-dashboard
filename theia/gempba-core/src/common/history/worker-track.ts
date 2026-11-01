import { WorkerSnapshot } from '../model/worker-snapshot';
import { CounterRate } from './counter-rate';
import { RingSeries } from './ring-series';
import { WorkerSeries } from './worker-series';

/** One worker's rolling history: a ring per series, the frame its next idle time is measured from, and its recent task counts. */
export class WorkerTrack {

    /**
     * Tasks per second are measured over this much of the worker's own time, not between two frames: a worker that
     * finishes a task every few seconds reads a steady rate, rather than 0 with a spike whenever a frame catches one.
     */
    static readonly RATE_WINDOW_MS = 10_000;

    protected readonly cpu: RingSeries;
    protected readonly tasksPerSecond: RingSeries;
    protected readonly idlePct: RingSeries;
    protected readonly rssBytes: RingSeries;
    protected last: WorkerSnapshot | undefined;
    /** The task counts of its recent frames, on its own clock, oldest first. */
    protected counts: { millis: number, tasks: number }[] = [];

    constructor(capacity: number) {
        this.cpu = new RingSeries(capacity);
        this.tasksPerSecond = new RingSeries(capacity);
        this.idlePct = new RingSeries(capacity);
        this.rssBytes = new RingSeries(capacity);
    }

    /** Records a frame the worker has not sent before, and returns whether it was one. */
    record(worker: WorkerSnapshot): boolean {
        const last = this.last;
        if (last?.seqNo === worker.seqNo) {
            return false;
        }
        this.cpu.push(worker.cpuPct);
        this.rssBytes.push(worker.rssBytes);
        // a lower sequence number means the worker restarted, and its counters with it
        if (last && worker.seqNo > last.seqNo) {
            const idleMicros = CounterRate.perSecond(last.idleMicrosPerWorker, worker.idleMicrosPerWorker, worker.localMillis - last.localMillis);
            if (idleMicros !== undefined) {
                // idle microseconds per second of wall time, as a percent
                this.idlePct.push(Math.min(idleMicros / 10_000, 100));
            }
            while (this.counts.length > 1 && worker.localMillis - this.counts[0].millis > WorkerTrack.RATE_WINDOW_MS) {
                this.counts.shift();
            }
            const since = this.counts[0];
            const tasks = since && CounterRate.perSecond(since.tasks, worker.tasksLocalTotal, worker.localMillis - since.millis);
            if (tasks !== undefined) {
                this.tasksPerSecond.push(tasks);
            } else {
                this.counts = [];
            }
        } else {
            this.counts = [];
        }
        this.counts.push({ millis: worker.localMillis, tasks: worker.tasksLocalTotal });
        this.last = worker;
        return true;
    }

    /** The newest tasks-per-second rate, or `undefined` before the worker sent two frames. */
    latestTasksPerSecond(): number | undefined {
        return this.tasksPerSecond.latest();
    }

    series(): WorkerSeries {
        return {
            cpu: this.cpu.values(),
            tasksPerSecond: this.tasksPerSecond.values(),
            idlePct: this.idlePct.values(),
            rssBytes: this.rssBytes.values()
        };
    }
}
