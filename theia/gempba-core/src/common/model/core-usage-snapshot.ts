export interface CoreUsageSnapshot {
    readonly workerId: number;
    readonly cpuPct: number;
    /** `|allowed_cpu_ids ∩ socket cpu_ids|`, or every socket core when the worker is unrestricted. */
    readonly accessibleCores: number;
    readonly socketCores: number;
}
