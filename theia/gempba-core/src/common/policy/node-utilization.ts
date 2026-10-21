export namespace NodeUtilization {

    /**
     * Per-allocation utilization: `clamp(sumCpuPct / allocatedCores, 0, 100)`, or 0 without an allocation.
     * `sumCpuPct` is in percent-of-one-core units (400 = four cores pegged).
     */
    export function pct(sumCpuPct: number, allocatedCores: number): number {
        if (allocatedCores <= 0) {
            return 0;
        }
        const util = sumCpuPct / allocatedCores;
        if (util < 0) {
            return 0;
        }
        return Math.min(util, 100);
    }
}
