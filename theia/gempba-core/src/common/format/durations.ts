import { NumberText } from './number-text';

const US_PER_MS = 1_000;
const US_PER_S = 1_000_000;
const US_PER_MIN = 60 * US_PER_S;
const US_PER_HOUR = 60 * US_PER_MIN;
const US_PER_DAY = 24 * US_PER_HOUR;

export namespace Durations {

    /**
     * `238 µs`, `238.3 ms`, `4.5 s`, `5 m 30 s`, `1 h 23 m 45 s`, `2 d 4 h 30 m`; negative → `—`.
     * From one minute on, every coarser unit is shown so the column width stays stable.
     */
    export function format(microseconds: number): string {
        if (microseconds < 0) {
            return '—';
        }
        if (microseconds < US_PER_MS) {
            return `${microseconds} µs`;
        }
        if (microseconds < US_PER_S) {
            return `${NumberText.fixed(microseconds / US_PER_MS, 1)} ms`;
        }
        if (microseconds < US_PER_MIN) {
            return `${NumberText.fixed(microseconds / US_PER_S, 1)} s`;
        }
        const totalSeconds = Math.floor(microseconds / US_PER_S);
        const seconds = totalSeconds % 60;
        const totalMinutes = Math.floor(totalSeconds / 60);
        if (microseconds < US_PER_HOUR) {
            return `${totalMinutes} m ${seconds} s`;
        }
        const minutes = totalMinutes % 60;
        const totalHours = Math.floor(totalMinutes / 60);
        if (microseconds < US_PER_DAY) {
            return `${totalHours} h ${minutes} m ${seconds} s`;
        }
        const hours = totalHours % 24;
        const days = Math.floor(totalHours / 24);
        return `${days} d ${hours} h ${minutes} m`;
    }

    /** Whole seconds: `45 s` below a minute, otherwise the same layout as {@link format}. */
    export function formatSeconds(seconds: number): string {
        if (seconds < 0) {
            return '—';
        }
        if (seconds < 60) {
            return `${seconds} s`;
        }
        return format(seconds * US_PER_S);
    }
}
