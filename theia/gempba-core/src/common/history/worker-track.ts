import { WorkerSnapshot } from '../model/worker-snapshot';
import { CounterRate } from './counter-rate';
import { RingSeries } from './ring-series';
import { WorkerSeries } from './worker-series';

/** One worker's rolling history: a ring per series, and the frame its next rates are measured from. */
export class WorkerTrack {

    protected readonly cpu: RingSeries;
    protected readonly tasksPerSecond: RingSeries;
    protected readonly idlePct: RingSeries;
    protected readonly rssBytes: RingSeries;
    protected last: WorkerSnapshot | undefined;

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
            const elapsedMillis = worker.localMillis - last.localMillis;
            const tasks = CounterRate.perSecond(last.tasksLocalTotal, worker.tasksLocalTotal, elapsedMillis);
            const idleMicros = CounterRate.perSecond(last.idleMicrosPerWorker, worker.idleMicrosPerWorker, elapsedMillis);
            if (tasks !== undefined) {
                this.tasksPerSecond.push(tasks);
            }
            if (idleMicros !== undefined) {
                // idle microseconds per second of wall time, as a percent
                this.idlePct.push(Math.min(idleMicros / 10_000, 100));
            }
        }
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
