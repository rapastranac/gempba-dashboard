import { RefreshInterval } from './refresh-interval';

/**
 * The two refresh intervals gempba 4.2 takes: how often each rank, and each node's sentinel, sends a frame. The dashboard
 * keeps one refresh rate, as gempba 4.3 drives every frame at one interval; the mocker and the replay emitter, which
 * imitate gempba 4.2 too, keep both.
 */
export interface RefreshRates {
    readonly workerIntervalMs: number;
    readonly nodeIntervalMs: number;
}

export namespace RefreshRates {

    export function defaults(): RefreshRates {
        return { workerIntervalMs: RefreshInterval.DEFAULT_MS, nodeIntervalMs: RefreshInterval.DEFAULT_NODE_MS };
    }

    /** Rates gempba accepts, from values that may have been typed by hand: a number is clamped, anything else takes its default. */
    export function of(values: { readonly workerIntervalMs?: unknown, readonly nodeIntervalMs?: unknown }): RefreshRates {
        return {
            workerIntervalMs: intervalOr(values.workerIntervalMs, RefreshInterval.DEFAULT_MS),
            nodeIntervalMs: intervalOr(values.nodeIntervalMs, RefreshInterval.DEFAULT_NODE_MS)
        };
    }

    export function equals(a: RefreshRates, b: RefreshRates): boolean {
        return a.workerIntervalMs === b.workerIntervalMs && a.nodeIntervalMs === b.nodeIntervalMs;
    }
}

function intervalOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? RefreshInterval.clamp(value) : fallback;
}
