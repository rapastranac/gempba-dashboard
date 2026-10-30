/** Whether a stream shows what is happening now: frames arriving, frames late, or no stream at all. */
export type Liveness = 'live' | 'stale' | 'off';

export namespace Liveness {

    /** Frames later than this many intervals make a stream stale. */
    export const LATE_INTERVALS = 3;
    /** However fast the rate, a stream is not stale sooner than this after its latest frame. */
    export const MIN_LATE_MS = 2000;

    export function of(stream: { streaming: boolean, lastFrameAt?: number, now: number, intervalMs: number }): Liveness {
        if (!stream.streaming) {
            return 'off';
        }
        if (stream.lastFrameAt === undefined) {
            return 'stale';
        }
        return stream.now - stream.lastFrameAt > Math.max(LATE_INTERVALS * stream.intervalMs, MIN_LATE_MS) ? 'stale' : 'live';
    }

    export function label(liveness: Liveness): string {
        switch (liveness) {
            case 'live':
                return 'Live';
            case 'stale':
                return 'Waiting for frames';
            default:
                return 'Not streaming';
        }
    }
}
