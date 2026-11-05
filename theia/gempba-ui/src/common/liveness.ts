/**
 * Whether a stream shows what is happening now: frames arriving, gempba paused, the run ended, frames late, or no
 * stream at all.
 */
export type Liveness = 'live' | 'paused' | 'ended' | 'stale' | 'off';

export namespace Liveness {

    /** Frames later than this many intervals make a stream stale. */
    export const LATE_INTERVALS = 3;
    /** However fast the rate, a stream is not stale sooner than this after its latest frame. */
    export const MIN_LATE_MS = 2000;

    /** What a stream's liveness is judged on, on this machine's clock. */
    export interface Stream {
        readonly streaming: boolean;
        /** When the latest frames arrived. */
        readonly lastFrameAt?: number;
        /** When the latest line of any kind arrived; a paused gempba still sends its header every interval. */
        readonly lastLineAt?: number;
        readonly now: number;
        readonly intervalMs: number;
        /** Whether the latest line said telemetry is paused. */
        readonly paused?: boolean;
        /** Whether the run sent its final line. */
        readonly ended?: boolean;
    }

    export function of(stream: Stream): Liveness {
        if (!stream.streaming) {
            return 'off';
        }
        if (stream.ended) {
            return 'ended';
        }
        if (stream.paused) {
            return isLate(stream.lastLineAt, stream) ? 'stale' : 'paused';
        }
        return isLate(stream.lastFrameAt, stream) ? 'stale' : 'live';
    }

    export function label(liveness: Liveness): string {
        switch (liveness) {
            case 'live':
                return 'Live';
            case 'paused':
                return 'Paused';
            case 'ended':
                return 'Run ended';
            case 'stale':
                return 'Waiting for frames';
            default:
                return 'Not streaming';
        }
    }

    function isLate(at: number | undefined, stream: Stream): boolean {
        return at === undefined || stream.now - at > Math.max(LATE_INTERVALS * stream.intervalMs, MIN_LATE_MS);
    }
}
