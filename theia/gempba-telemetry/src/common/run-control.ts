import { StreamCondition } from '@gempba/core';

/**
 * A control the user sends a running gempba (v4.3.0 and later): pause or resume its telemetry, ask for one full line
 * now, or mark a moment of the run with a label, listed in the run's markers. From gempba v5.0.0, stop the run with
 * its stop token: it winds down and ends with its best result so far.
 */
export type RunControl =
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' }
    | { readonly kind: 'snapshot' }
    | { readonly kind: 'mark', readonly label: string }
    | { readonly kind: 'stop', readonly token: string };

export namespace RunControl {

    /** gempba keeps a marker's label from 1 to 64 bytes in UTF-8, and ignores a mark outside that. */
    export const MAX_LABEL_BYTES = 64;

    /** Which controls a stream in this condition takes: Pause while live, Resume while paused, Snapshot, Mark and Stop in either. */
    export interface Offered {
        readonly pause: boolean;
        readonly resume: boolean;
        readonly snapshot: boolean;
        readonly mark: boolean;
        readonly stop: boolean;
    }

    export function offered(condition: StreamCondition | undefined): Offered {
        const connected = condition === 'live' || condition === 'paused';
        return { pause: condition === 'live', resume: condition === 'paused', snapshot: connected, mark: connected, stop: connected };
    }

    /**
     * Why a stop with this token can't go: gempba stops the run only for the token in the `GEMPBA_STOP_TOKEN` it was
     * started with, so an empty one never matches. It refuses a wrong token in its own log; nothing comes back.
     */
    export function tokenProblem(token: string): string | undefined {
        return token.length === 0 ? 'Enter the run\'s stop token' : undefined;
    }

    /** Why gempba would ignore this label, or `undefined` when it keeps it. */
    export function labelProblem(label: string): string | undefined {
        const bytes = new TextEncoder().encode(label).length;
        if (bytes === 0) {
            return 'Enter a label';
        }
        return bytes > MAX_LABEL_BYTES ? `At most ${MAX_LABEL_BYTES} bytes in UTF-8; this label has ${bytes}` : undefined;
    }

    /** `pause`, `resume`, `snapshot`, `mark "phase 2"` or `stop`: how the status names the control, never with its token. */
    export function text(control: RunControl): string {
        return control.kind === 'mark' ? `mark ${JSON.stringify(control.label)}` : control.kind;
    }
}
