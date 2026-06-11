package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * The top-level JSON object the gempba center publishes once per broadcast
 * tick. {@code version} is the schema version (TELEMETRY_SCHEMA_VERSION on
 * the C++ side); a mismatch should fail loud on the client rather than
 * silently misinterpret frames.
 */
public record BroadcastEnvelope(
        int version,
        long ts,
        long elapsedSeconds,
        Topology topology,
        List<WorkerFrame> workers,
        List<NodeFrame> nodes
) {
}
