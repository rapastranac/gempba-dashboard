/**
 * How long a change animates: most of a frame interval, so a value settles before the next frame moves it again, and
 * never long enough to lag. At the fastest rates, or when the user asked for less motion, nothing animates.
 */
export namespace MotionTiming {

    /** The share of a frame interval an animation takes. */
    export const SHARE = 0.8;
    export const MAX_MS = 400;
    /** Animations shorter than this read as jitter rather than motion, so they are dropped. */
    export const MIN_MS = 80;

    export function durationMs(intervalMs: number, reducedMotion = false): number {
        if (reducedMotion || !Number.isFinite(intervalMs) || intervalMs <= 0) {
            return 0;
        }
        const ms = Math.round(intervalMs * SHARE);
        return ms < MIN_MS ? 0 : Math.min(ms, MAX_MS);
    }
}
