/** One-shot disturbances the mocker can inject into a running mock, to watch how the dashboard copes. */
export type MockFault = 'stall-node' | 'restart-worker' | 'drop-clients' | 'add-worker' | 'remove-worker' | 'malformed-line' | 'end-run';

export namespace MockFault {

    export const ALL: readonly MockFault[] = ['stall-node', 'restart-worker', 'drop-clients', 'add-worker', 'remove-worker', 'malformed-line', 'end-run'];

    /** How long a stalled node sends no new frames. */
    export const STALL_MS = 10_000;

    export function label(fault: MockFault): string {
        switch (fault) {
            case 'stall-node': return `Stall a node for ${STALL_MS / 1000} s`;
            case 'restart-worker': return 'Restart a worker';
            case 'drop-clients': return 'Drop every client';
            case 'add-worker': return 'Add a worker';
            case 'remove-worker': return 'Remove a worker';
            case 'malformed-line': return 'Send a malformed line';
            case 'end-run': return 'End the run';
        }
    }
}
