/** The latest samples of one series, up to a fixed number, in a buffer allocated once, so memory stays flat as frames arrive. */
export class RingSeries {

    protected readonly buffer: Float64Array;
    protected start = 0;
    protected count = 0;

    constructor(readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity < 1) {
            throw new RangeError(`A ring needs a whole capacity of at least 1, not ${capacity}`);
        }
        this.buffer = new Float64Array(capacity);
    }

    get length(): number {
        return this.count;
    }

    /** Appends a sample, dropping the oldest once the ring is full. */
    push(value: number): void {
        this.buffer[(this.start + this.count) % this.capacity] = value;
        if (this.count < this.capacity) {
            this.count++;
        } else {
            this.start = (this.start + 1) % this.capacity;
        }
    }

    /** The newest sample, or `undefined` while the ring is empty. */
    latest(): number | undefined {
        return this.count === 0 ? undefined : this.buffer[(this.start + this.count - 1) % this.capacity];
    }

    /** A copy of the samples, oldest first. */
    values(): number[] {
        const values = new Array<number>(this.count);
        for (let i = 0; i < this.count; i++) {
            values[i] = this.buffer[(this.start + i) % this.capacity];
        }
        return values;
    }

    clear(): void {
        this.start = 0;
        this.count = 0;
    }
}
