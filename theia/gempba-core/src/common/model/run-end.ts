/**
 * How a run ended, as its final telemetry line says from gempba v5.0.0 on (gempba#465). A stream that closes without
 * a final line has none: the run was lost, killed without warning, or the connection dropped.
 */
export interface RunEnd {
    readonly reason: RunEnd.Reason;
    /** What stopped an interrupted run. */
    readonly trigger?: RunEnd.Trigger;
    /** The signal's name, such as `SIGTERM`, when a signal stopped the run. */
    readonly signal?: string;
}

export namespace RunEnd {

    /** `completed`: the search space was exhausted, so the result is proven; `interrupted`: a stop ended the run early, with its best result so far. */
    export type Reason = 'completed' | 'interrupted';

    /** `code`: the program called `gempba::request_stop()`; `signal`: `SIGINT` or `SIGTERM`; `control`: a client's stop line. */
    export type Trigger = 'code' | 'signal' | 'control';

    export const REASONS: readonly Reason[] = ['completed', 'interrupted'];
    export const TRIGGERS: readonly Trigger[] = ['code', 'signal', 'control'];

    /** `Run completed`, `Run interrupted by SIGTERM`, `Run stopped from a dashboard`, `Run stopped by its program`, or `Run interrupted`. */
    export function headline(end: RunEnd): string {
        if (end.reason === 'completed') {
            return 'Run completed';
        }
        switch (end.trigger) {
            case 'signal':
                return `Run interrupted by ${end.signal || 'a signal'}`;
            case 'control':
                return 'Run stopped from a dashboard';
            case 'code':
                return 'Run stopped by its program';
            default:
                return 'Run interrupted';
        }
    }

    /** What the run's last state holds: a proven result, or the best one found before the stop. */
    export function result(end: RunEnd): string {
        return end.reason === 'completed' ? 'result proven' : 'best result so far';
    }
}
