import { RingSeries } from './ring-series';

/**
 * How often frames actually arrive, since gempba acknowledges no rate change: the median of the latest intervals
 * between two new frames of one sender, across every sender, measured on the senders' own clocks.
 */
export class FrameCadence {

    /** Intervals the median is taken over: a few frames of each sender in a small run, a moment of a large one. */
    static readonly SAMPLES = 16;

    protected readonly intervals = new RingSeries(FrameCadence.SAMPLES);
    protected readonly lastBySender = new Map<string, { readonly frameId: number, readonly millis: number }>();

    /**
     * Records a frame `sender` took at `millis` on its own clock; `frameId` tells a new frame from a repeated one.
     * A clock that went back, as when the sender restarted, starts that sender over.
     */
    record(sender: string, frameId: number, millis: number): void {
        const last = this.lastBySender.get(sender);
        if (last?.frameId === frameId) {
            return;
        }
        if (last && millis > last.millis) {
            this.intervals.push(millis - last.millis);
        }
        this.lastBySender.set(sender, { frameId, millis });
    }

    /** The median interval in whole milliseconds, or `undefined` before any sender sent two frames. */
    medianMs(): number | undefined {
        const values = this.intervals.values().sort((a, b) => a - b);
        if (values.length === 0) {
            return undefined;
        }
        const middle = Math.floor(values.length / 2);
        return Math.round(values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2);
    }

    clear(): void {
        this.intervals.clear();
        this.lastBySender.clear();
    }
}
