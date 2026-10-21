import { isBlank } from './values';

/** The job pointer: which gempba center to observe over an open session. Cheap to change, no re-auth. */
export interface TargetSpec {
    /** Compute node `user@host` (JUMP only); blank for LOCAL and HOST. */
    readonly targetHost: string;
    /** Loopback port gempba listens on at the destination. */
    readonly gempbaPort: number;
}

export namespace TargetSpec {

    export function of(targetHost: string | undefined, gempbaPort: number): TargetSpec {
        return { targetHost: targetHost ?? '', gempbaPort };
    }

    export function hasTargetHost(spec: TargetSpec): boolean {
        return !isBlank(spec.targetHost);
    }
}
