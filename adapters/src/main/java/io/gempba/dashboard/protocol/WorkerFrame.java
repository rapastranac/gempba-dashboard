package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * Per-worker telemetry frame. Mirrors the C++ WorkerFrame struct emitted by
 * gempba's center every {@code m_worker_interval_ms} (default 500 ms).
 * Component names are camelCase here; Jackson's snake_case strategy maps them
 * to the JSON keys produced by gempba's json_serializer.
 * <p>
 * Task counters are mutually exclusive buckets:
 * - {@code tasksLocalTotal} — submissions to this worker's own thread pool
 * - {@code tasksSentTotal}  — submissions dispatched to a remote worker
 * - {@code tasksRecvTotal}  — remote tasks landing on this worker
 * A given task event lands in exactly one bucket.
 * <p>
 * The two queue-like counters are <em>not</em> equivalent and live at
 * different layers:
 * - {@code tasksRunning} is a pool-thread snapshot — how many tasks are
 * actively executing in this rank's load-balancer thread pool right now.
 * It is bounded above by the pool size.
 * - {@code schedulerPendingCount} is the IPC queue — pending cross-rank
 * requests sitting in the scheduler before they're dispatched. Only one
 * queue exists per rank, and only the IPC scheduler populates it.
 * <p>
 * {@code idleMicrosecondsPerWorker} is the cumulative idle time *averaged*
 * across the thread pool's workers — i.e. the C++ side already divides by
 * pool size before publishing. Bigger = pool sitting around; comparable
 * across runs with different thread-pool sizes.
 */
public record WorkerFrame(
        long workerId,
        long seqNo,
        long workerLocalMs,
        long tasksLocalTotal,
        long tasksSentTotal,
        long tasksRecvTotal,
        int tasksRunning,
        int schedulerPendingCount,
        long idleMicrosecondsPerWorker,
        float processCpuPct,
        long processRssBytes,
        int processThreads,
        List<EdgeOut> edgesOut
) {
}
