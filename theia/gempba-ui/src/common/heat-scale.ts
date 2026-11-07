/**
 * The shades of a heat strip, for the load on a CPU: steps from idle to fully busy, each mixed in CSS from the heat
 * low and high theme colors, so no shade is a literal color and every theme restyles them.
 */
export namespace HeatScale {

    /** The busiest step; there are this many plus one, counting idle. */
    export const STEPS = 10;

    /** The step for a load in percent of one CPU: 0 when idle, {@link STEPS} when fully busy or more. */
    export function step(loadPct: number): number {
        if (!Number.isFinite(loadPct) || loadPct <= 0) {
            return 0;
        }
        return Math.min(STEPS, Math.round(loadPct * STEPS / 100));
    }

    /** How much of the high color a step mixes into the low one, as a CSS percentage. */
    export function mix(step: number): string {
        return `${Math.min(Math.max(step, 0), STEPS) * 100 / STEPS}%`;
    }
}
