package io.gempba.dashboard.protocol;

import java.util.List;

/**
 * The center-side view of all hosts and workers in the current run.
 */
public record Topology(
        List<TopologyNode> nodes,
        List<WorkerIdentity> identities
) {
}
