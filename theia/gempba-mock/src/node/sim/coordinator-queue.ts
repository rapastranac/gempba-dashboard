/** A task waiting at the centralized coordinator: the subtree it roots, and the bytes of its serialized subproblem. */
export interface QueuedTask {
    readonly tasks: number;
    readonly bytes: number;
}

/**
 * The centralized coordinator's queue: a max-heap that hands out the biggest subtree first. gempba orders it by an
 * application-specific measure of the packet (its set bits), for which the subtree's size stands in here.
 */
export class CoordinatorQueue {

    protected readonly heap: QueuedTask[] = [];
    protected bytesNow = 0;

    get length(): number {
        return this.heap.length;
    }

    /** The bytes every queued task holds, which the coordinator keeps in memory. */
    get bytes(): number {
        return this.bytesNow;
    }

    push(task: QueuedTask): void {
        const heap = this.heap;
        heap.push(task);
        this.bytesNow += task.bytes;
        let child = heap.length - 1;
        while (child > 0) {
            const parent = (child - 1) >> 1;
            if (heap[parent].tasks >= heap[child].tasks) {
                break;
            }
            [heap[parent], heap[child]] = [heap[child], heap[parent]];
            child = parent;
        }
    }

    pop(): QueuedTask | undefined {
        const heap = this.heap;
        const top = heap[0];
        if (top === undefined) {
            return undefined;
        }
        const last = heap.pop()!;
        this.bytesNow -= top.bytes;
        if (heap.length > 0) {
            heap[0] = last;
            let parent = 0;
            for (; ;) {
                const left = 2 * parent + 1;
                const right = left + 1;
                let biggest = parent;
                if (left < heap.length && heap[left].tasks > heap[biggest].tasks) {
                    biggest = left;
                }
                if (right < heap.length && heap[right].tasks > heap[biggest].tasks) {
                    biggest = right;
                }
                if (biggest === parent) {
                    break;
                }
                [heap[parent], heap[biggest]] = [heap[biggest], heap[parent]];
                parent = biggest;
            }
        }
        return top;
    }

    clear(): void {
        this.heap.length = 0;
        this.bytesNow = 0;
    }
}
