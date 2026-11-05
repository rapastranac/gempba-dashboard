/** Telemetry refresh bounds and defaults in milliseconds; the bounds mirror gempba's server-side clamp. */
export namespace RefreshInterval {
    export const MIN_MS = 50;
    export const MAX_MS = 600_000;
    /** The refresh rate gempba starts at, and the dashboard's: how often every frame is sent. */
    export const DEFAULT_MS = 500;
    /** gempba 4.2's node-frame interval, which the Java dashboard's settings file and the replay emitter still keep. */
    export const DEFAULT_NODE_MS = 1000;

    /** The intervals the controls offer; gempba takes any whole number of milliseconds between its bounds. */
    export const PRESETS_MS: readonly number[] = [100, 250, 500, 1000, 2000, 5000];

    /** The nearest interval gempba accepts: whole milliseconds, between its bounds. */
    export function clamp(ms: number): number {
        return Math.min(MAX_MS, Math.max(MIN_MS, Math.round(ms)));
    }

    /** A typed interval in milliseconds, or `undefined` unless it is a whole number between the bounds. */
    export function parse(text: string): number | undefined {
        const ms = Number(text.trim());
        return text.trim() !== '' && Number.isInteger(ms) && ms >= MIN_MS && ms <= MAX_MS ? ms : undefined;
    }

    /** `250 ms`, `1 s`, `2.5 s`, `90 s`, `10 min`. */
    export function label(ms: number): string {
        if (ms < 1000) {
            return `${ms} ms`;
        }
        if (ms % 60_000 === 0) {
            return `${ms / 60_000} min`;
        }
        return `${ms / 1000} s`;
    }
}
