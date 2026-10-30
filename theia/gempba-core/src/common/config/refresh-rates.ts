import { RefreshInterval } from './refresh-interval';

/** The two refresh intervals gempba accepts: how often each worker, and each node's sentinel, sends a frame. */
export interface RefreshRates {
    readonly workerIntervalMs: number;
    readonly nodeIntervalMs: number;
}

export namespace RefreshRates {

    export function defaults(): RefreshRates {
        return { workerIntervalMs: RefreshInterval.DEFAULT_WORKER_MS, nodeIntervalMs: RefreshInterval.DEFAULT_NODE_MS };
    }

    /** Rates gempba accepts, from values that may have been typed by hand: a number is clamped, anything else takes its default. */
    export function of(values: { readonly workerIntervalMs?: unknown, readonly nodeIntervalMs?: unknown }): RefreshRates {
        return {
            workerIntervalMs: intervalOr(values.workerIntervalMs, RefreshInterval.DEFAULT_WORKER_MS),
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
