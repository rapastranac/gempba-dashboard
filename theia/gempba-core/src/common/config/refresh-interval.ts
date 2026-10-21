/** Telemetry refresh bounds and defaults in milliseconds; the bounds mirror gempba's server-side clamp. */
export namespace RefreshInterval {
    export const MIN_MS = 50;
    export const MAX_MS = 600_000;
    export const DEFAULT_WORKER_MS = 500;
    export const DEFAULT_NODE_MS = 1000;
}
