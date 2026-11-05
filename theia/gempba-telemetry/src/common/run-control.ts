import { StreamCondition } from '@gempba/core';

/**
 * A control the user sends a running gempba (v4.3.0 and later): pause or resume its telemetry, ask for one full line
 * now, or mark a moment of the run with a label, listed in the run's markers.
 */
export type RunControl =
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' }
    | { readonly kind: 'snapshot' }
    | { readonly kind: 'mark', readonly label: string };

export namespace RunControl {

    /** gempba keeps a marker's label from 1 to 64 bytes in UTF-8, and ignores a mark outside that. */
    export const MAX_LABEL_BYTES = 64;

    /** Which controls a stream in this condition takes: Pause while live, Resume while paused, Snapshot and Mark in either. */
    export interface Offered {
        readonly pause: boolean;
        readonly resume: boolean;
        readonly snapshot: boolean;
        readonly mark: boolean;
    }

    export function offered(condition: StreamCondition | undefined): Offered {
        const connected = condition === 'live' || condition === 'paused';
        return { pause: condition === 'live', resume: condition === 'paused', snapshot: connected, mark: connected };
    }

    /** Why gempba would ignore this label, or `undefined` when it keeps it. */
    export function labelProblem(label: string): string | undefined {
        const bytes = new TextEncoder().encode(label).length;
        if (bytes === 0) {
            return 'Enter a label';
        }
        return bytes > MAX_LABEL_BYTES ? `At most ${MAX_LABEL_BYTES} bytes in UTF-8; this label has ${bytes}` : undefined;
    }

    /** `pause`, `resume`, `snapshot`, or `mark "phase 2"`: how the status names the control. */
    export function text(control: RunControl): string {
        return control.kind === 'mark' ? `mark ${JSON.stringify(control.label)}` : control.kind;
    }
}
