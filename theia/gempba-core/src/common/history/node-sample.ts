export interface NodeSample {
    /** Epoch millis of the frame the sample came from. */
    readonly timeStamp: number;
    readonly cpuPct: number;
    readonly memUsedBytes: number;
    readonly memTotalBytes: number;
}
