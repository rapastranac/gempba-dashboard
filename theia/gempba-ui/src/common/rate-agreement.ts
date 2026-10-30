/** Whether frames arrive at the rate set: gempba acknowledges nothing, so a rate it clamped or ignored shows only here. */
export type RateAgreement = 'unknown' | 'agrees' | 'differs';

export namespace RateAgreement {

    /** How far the observed interval may stray from the one set, as a share of it. */
    export const TOLERANCE = 0.25;

    export function of(setMs: number, observedMs: number | undefined): RateAgreement {
        if (observedMs === undefined || !Number.isFinite(observedMs) || setMs <= 0) {
            return 'unknown';
        }
        return Math.abs(observedMs - setMs) <= setMs * TOLERANCE ? 'agrees' : 'differs';
    }
}
