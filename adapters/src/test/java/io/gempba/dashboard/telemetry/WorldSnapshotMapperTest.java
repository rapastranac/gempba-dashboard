package io.gempba.dashboard.telemetry;

import io.gempba.dashboard.model.*;
import io.gempba.dashboard.protocol.*;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class WorldSnapshotMapperTest {

    // ---- helpers ------------------------------------------------------------

    private static WorkerFrame frame(long id, long seq, float cpu, long rss, List<EdgeOut> edges) {
        return new WorkerFrame(id, seq, 0L,
                /*tasksLocal*/ 100, /*tasksSent*/ 20, /*tasksRecv*/ 5,
                /*tasksRunning*/ 3, /*schedulerPending*/ 7, /*idleMicros*/ 1_000,
                cpu, rss, /*threads*/ 8, edges);
    }

    private static WorkerIdentity ident(long id, String host, long pid, int socket, List<Integer> allowed) {
        return new WorkerIdentity(id, host, pid, socket, allowed);
    }

    private static TopologySocket socket(int id, String name, int phys, int logical, List<Integer> cpuIds) {
        return new TopologySocket(id, name, phys, logical, cpuIds);
    }

    /**
     * Two-socket node "n0": socket 0 = CPUs 0-3, socket 1 = CPUs 4-7.
     */
    private static BroadcastEnvelope twoSocketEnvelope() {
        TopologySocket s0 = socket(0, "Xeon Gold", 2, 4, List.of(0, 1, 2, 3));
        TopologySocket s1 = socket(1, "Xeon Gold", 2, 4, List.of(4, 5, 6, 7));
        TopologyNode n0 = new TopologyNode("n0", /*sentinel*/ 10L,
                /*physical*/ 4, /*logical*/ 8, /*memTotal*/ 64L * 1024 * 1024 * 1024,
                List.of(10L, 11L, 12L), List.of(s0, s1));

        WorkerIdentity i10 = ident(10, "n0", 1000, 0, List.of(0, 1));   // restricted: 2 of 4
        WorkerIdentity i11 = ident(11, "n0", 1001, 1, null);            // unrestricted: all 4
        WorkerIdentity i12 = ident(12, "n0", 1002, 0, List.of());       // empty == all 4
        Topology topo = new Topology(List.of(n0), List.of(i10, i11, i12));

        NodeFrame nf = new NodeFrame(10L, 0L, "n0", 2, 8,
                /*memTotal*/ 64L * 1024 * 1024 * 1024,
                /*memAvail*/ 24L * 1024 * 1024 * 1024,
                null, null, null);

        WorkerFrame w10 = frame(10, 5, 80.0f, 500_000, List.of(new EdgeOut(11, 4096, 3)));
        WorkerFrame w11 = frame(11, 5, 50.0f, 400_000, List.of());
        WorkerFrame w12 = frame(12, 5, 25.0f, 300_000, null);

        // Worker order 10,12 (socket 0), 11 (socket 1): interleaved so we can
        // verify per-socket grouping is by primary_socket, not arrival order.
        return new BroadcastEnvelope(7, 1_700_000_000_000L, 42L,
                topo, List.of(w10, w12, w11), List.of(nf));
    }

    // ---- tests --------------------------------------------------------------

    private static double utilOf(BroadcastEnvelope env, String host) {
        return WorldSnapshotMapper.toWorldSnapshot(env).nodes().stream()
                .filter(n -> host.equals(n.host()))
                .findFirst().orElseThrow()
                .nodeUtilPct();
    }

    private static WorkerFrame cpuFrame(long wid, float cpu) {
        return new WorkerFrame(wid, 1, 0, 0, 0, 0, 0, 0, 0, cpu, 0, 1, List.of());
    }

    private static WorkerIdentity id(long wid, String host, List<Integer> allowed) {
        return new WorkerIdentity(wid, host, 1000 + wid, 0, allowed);
    }

    private static List<Integer> cores(int n) {
        List<Integer> out = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            out.add(i);
        }
        return out;
    }

    /**
     * One host whose topology node owns exactly the given identities' workers.
     */
    private static BroadcastEnvelope singleHost(String host,
                                                List<WorkerFrame> workers,
                                                List<WorkerIdentity> idents) {
        List<Long> workerIds = new ArrayList<>();
        for (WorkerIdentity wi : idents) {
            workerIds.add(wi.workerId());
        }
        long sentinel = idents.isEmpty() ? -1L : idents.getFirst().workerId();
        Topology topo = new Topology(
                List.of(new TopologyNode(host, sentinel, 0, 0, 0L, workerIds, List.of())),
                idents);
        return new BroadcastEnvelope(7, 1L, 0L, topo, workers, List.of());
    }

    @Test
    void null_envelope_maps_to_empty_model() {
        WorldSnapshot m = WorldSnapshotMapper.toWorldSnapshot(null);
        assertThat(m).isEqualTo(WorldSnapshot.empty());
        assertThat(m.totalNodes()).isZero();
        assertThat(m.totalWorkers()).isZero();
    }

    @Test
    void carries_frame_scalars_and_totals() {
        WorldSnapshot m = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope());
        assertThat(m.schemaVersion()).isEqualTo(7);
        assertThat(m.timestampMillis()).isEqualTo(1_700_000_000_000L);
        assertThat(m.elapsedSeconds()).isEqualTo(42L);
        assertThat(m.totalNodes()).isEqualTo(1);
        assertThat(m.totalWorkers()).isEqualTo(3);
    }

    @Test
    void resolves_node_header_fields() {
        NodeSnapshot n = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope()).nodes().getFirst();
        assertThat(n.host()).isEqualTo("n0");
        assertThat(n.socketCount()).isEqualTo(2);
        assertThat(n.physicalCores()).isEqualTo(4);
        assertThat(n.logicalCores()).isEqualTo(8);
        assertThat(n.hasLiveMemory()).isTrue();
        assertThat(n.memTotalBytes()).isEqualTo(64L * 1024 * 1024 * 1024);
        assertThat(n.memUsedBytes()).isEqualTo(40L * 1024 * 1024 * 1024); // 64 - 24
        assertThat(n.sentinelWorkerId()).isEqualTo(10L);
    }

    @Test
    void groups_workers_into_sockets_in_numeric_order() {
        NodeSnapshot n = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope()).nodes().getFirst();
        assertThat(n.sockets()).extracting(SocketSnapshot::socketId).containsExactly(0, 1);

        SocketSnapshot s0 = n.sockets().get(0);
        assertThat(s0.name()).isEqualTo("Xeon Gold");
        assertThat(s0.logicalCores()).isEqualTo(4);
        assertThat(s0.cpuIds()).containsExactly(0, 1, 2, 3);
        assertThat(s0.hasTopology()).isTrue();
        // socket 0 holds workers 10 and 12, in frame-arrival order
        assertThat(s0.workers()).extracting(WorkerSnapshot::workerId).containsExactly(10L, 12L);

        SocketSnapshot s1 = n.sockets().get(1);
        assertThat(s1.workers()).extracting(WorkerSnapshot::workerId).containsExactly(11L);
    }

    @Test
    void core_usage_intersects_allowed_with_socket_cpus() {
        NodeSnapshot n = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope()).nodes().getFirst();
        List<CoreUsageSnapshot> s0 = n.sockets().get(0).coreUsage();
        // worker 10: allowed {0,1} ∩ {0,1,2,3} = 2 ; worker 12: empty → all 4
        assertThat(s0).extracting(CoreUsageSnapshot::workerId, CoreUsageSnapshot::accessibleCores, CoreUsageSnapshot::socketCores)
                .containsExactlyInAnyOrder(
                        org.assertj.core.groups.Tuple.tuple(10L, 2, 4),
                        org.assertj.core.groups.Tuple.tuple(12L, 4, 4));

        List<CoreUsageSnapshot> s1 = n.sockets().get(1).coreUsage();
        // worker 11: null allowed → all 4
        assertThat(s1).extracting(CoreUsageSnapshot::workerId, CoreUsageSnapshot::accessibleCores)
                .containsExactly(org.assertj.core.groups.Tuple.tuple(11L, 4));
    }

    // ---- per-allocation CPU (the "your cores, your work" metric) -------------
    // These acceptance scenarios used to live in NodeHistoryStoreTest; the join
    // moved into the mapper, so they now assert NodeSnapshot.nodeUtilPct directly.

    @Test
    void maps_worker_counters_and_peers() {
        NodeSnapshot n = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope()).nodes().getFirst();
        WorkerSnapshot w10 = n.sockets().get(0).workers().getFirst();
        assertThat(w10.workerId()).isEqualTo(10L);
        assertThat(w10.seqNo()).isEqualTo(5L);
        assertThat(w10.pid()).isEqualTo(1000L);
        assertThat(w10.sentinel()).isTrue();              // sentinelWorkerId == 10
        assertThat(w10.tasksLocalTotal()).isEqualTo(100L);
        assertThat(w10.tasksRunning()).isEqualTo(3);
        assertThat(w10.schedulerPendingCount()).isEqualTo(7);
        assertThat(w10.cpuPct()).isEqualTo(80.0);
        assertThat(w10.rssBytes()).isEqualTo(500_000L);
        assertThat(w10.threads()).isEqualTo(8);
        assertThat(w10.elapsedSeconds()).isEqualTo(42L);
        assertThat(w10.peers()).hasSize(1);
        assertThat(w10.peers().getFirst().peerWorkerId()).isEqualTo(11);
        assertThat(w10.peers().getFirst().bytes()).isEqualTo(4096L);

        WorkerSnapshot w11 = n.sockets().get(1).workers().getFirst();
        assertThat(w11.sentinel()).isFalse();
        assertThat(w11.peers()).isEmpty();                // null edges → empty list
    }

    @Test
    void structure_key_has_one_entry_per_worker() {
        WorldSnapshot m = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope());
        assertThat(m.structure().keys())
                .containsExactlyInAnyOrder("n0|0|10", "n0|0|12", "n0|1|11");
    }

    @Test
    void worker_without_identity_falls_into_unknown_host() {
        // No topology, no identities: the lone worker has no host mapping.
        WorkerFrame orphan = frame(99, 1, 10.0f, 1000, null);
        BroadcastEnvelope env = new BroadcastEnvelope(7, 1L, 0L, null, List.of(orphan), null);

        WorldSnapshot m = WorldSnapshotMapper.toWorldSnapshot(env);
        assertThat(m.totalNodes()).isEqualTo(1);
        NodeSnapshot n = m.nodes().getFirst();
        assertThat(n.host()).isEqualTo(WorldSnapshotMapper.UNKNOWN_HOST);
        assertThat(n.sockets()).hasSize(1);
        assertThat(n.sockets().getFirst().socketId()).isZero();
        assertThat(n.sockets().getFirst().hasTopology()).isFalse();
        assertThat(n.sockets().getFirst().coreUsage()).isEmpty(); // no topology → no rows
        assertThat(m.structure().keys()).containsExactly("(unknown host)|0|99");
    }

    @Test
    void node_without_live_frame_uses_topology_memory_total() {
        TopologySocket s0 = socket(0, "EPYC", 0, 4, List.of(0, 1, 2, 3));
        TopologyNode n0 = new TopologyNode("n0", 10L, 0, 4, 32L * 1024 * 1024 * 1024,
                List.of(10L), List.of(s0));
        Topology topo = new Topology(List.of(n0), List.of(ident(10, "n0", 1, 0, null)));
        WorkerFrame w10 = frame(10, 1, 10.0f, 1000, null);
        // nodes list is null → no NodeFrame for n0
        BroadcastEnvelope env = new BroadcastEnvelope(7, 1L, 0L, topo, List.of(w10), null);

        NodeSnapshot n = WorldSnapshotMapper.toWorldSnapshot(env).nodes().getFirst();
        assertThat(n.hasLiveMemory()).isFalse();
        assertThat(n.memUsedBytes()).isZero();
        assertThat(n.memTotalBytes()).isEqualTo(32L * 1024 * 1024 * 1024);
        assertThat(n.physicalCores()).isZero(); // topology reported 0 (unknown)
    }

    @Test
    void for_host_narrows_to_one_node() {
        // Build a second node "n1" so forHost has something to filter out.
        BroadcastEnvelope base = twoSocketEnvelope();
        TopologyNode n1 = new TopologyNode("n1", 20L, 4, 8, 0L, List.of(20L), List.of());
        Topology merged = new Topology(
                List.of(base.topology().nodes().getFirst(), n1),
                List.of(
                        base.topology().identities().get(0),
                        base.topology().identities().get(1),
                        base.topology().identities().get(2),
                        ident(20, "n1", 2000, 0, null)));
        WorkerFrame w20 = frame(20, 1, 5.0f, 100, null);
        BroadcastEnvelope env = new BroadcastEnvelope(
                base.version(), base.ts(), base.elapsedSeconds(),
                merged,
                List.of(base.workers().get(0), base.workers().get(1), base.workers().get(2), w20),
                base.nodes());

        WorldSnapshot full = WorldSnapshotMapper.toWorldSnapshot(env);
        assertThat(full.totalNodes()).isEqualTo(2);

        WorldSnapshot only0 = full.forHost("n0");
        assertThat(only0.nodes()).extracting(NodeSnapshot::host).containsExactly("n0");
        assertThat(only0.totalWorkers()).isEqualTo(3);
        assertThat(only0.structure().keys()).containsExactlyInAnyOrder("n0|0|10", "n0|0|12", "n0|1|11");

        WorldSnapshot none = full.forHost("does-not-exist");
        assertThat(none.nodes()).isEmpty();
        assertThat(none.schemaVersion()).isEqualTo(7); // scalars preserved
    }

    @Test
    void four_cores_pegged_over_a_four_core_allocation_is_100() {
        assertThat(utilOf(singleHost("h",
                List.of(cpuFrame(0, 400f)), List.of(id(0, "h", cores(4)))), "h"))
                .isCloseTo(100.0, within(1e-9));
    }

    @Test
    void ten_cores_busy_over_a_twenty_core_allocation_is_about_50() {
        assertThat(utilOf(singleHost("h",
                List.of(cpuFrame(0, 1000f)), List.of(id(0, "h", cores(20)))), "h"))
                .isCloseTo(50.0, within(1e-9));
    }

    @Test
    void idle_allocation_is_zero() {
        assertThat(utilOf(singleHost("h",
                List.of(cpuFrame(0, 0f)), List.of(id(0, "h", cores(4)))), "h"))
                .isEqualTo(0.0);
    }

    // ---- util helpers -------------------------------------------------------

    @Test
    void oversubscription_clamps_to_100() {
        assertThat(utilOf(singleHost("h",
                List.of(cpuFrame(0, 500f)), List.of(id(0, "h", cores(4)))), "h"))
                .isEqualTo(100.0);
    }

    @Test
    void worker_without_identity_contributes_no_allocation_so_util_is_zero() {
        // Topology maps worker 0 to host h, but there is no identity → no
        // allocated cores → denominator 0 → 0%.
        Topology topo = new Topology(
                List.of(new TopologyNode("h", 0L, 0, 0, 0L, List.of(0L), List.of())),
                List.of());
        BroadcastEnvelope env = new BroadcastEnvelope(7, 1L, 0L, topo,
                List.of(cpuFrame(0, 400f)), List.of());
        assertThat(utilOf(env, "h")).isEqualTo(0.0);
    }

    @Test
    void empty_allocation_is_zero() {
        assertThat(utilOf(singleHost("h",
                List.of(cpuFrame(0, 400f)), List.of(id(0, "h", List.of()))), "h"))
                .isEqualTo(0.0);
    }

    @Test
    void aggregates_multiple_ranks_with_disjoint_allocations() {
        // Two ranks, 2 cores each, both at 200% → union of 4 cores, 400% → 100%.
        BroadcastEnvelope env = singleHost("h",
                List.of(cpuFrame(0, 200f), cpuFrame(1, 200f)),
                List.of(id(0, "h", List.of(0, 1)), id(1, "h", List.of(2, 3))));
        assertThat(utilOf(env, "h")).isCloseTo(100.0, within(1e-9));
    }

    @Test
    void util_excludes_workers_on_other_hosts() {
        Topology topo = new Topology(
                List.of(new TopologyNode("a", 0L, 0, 0, 0L, List.of(0L), List.of()),
                        new TopologyNode("b", 1L, 0, 0, 0L, List.of(1L), List.of())),
                List.of(id(0, "a", cores(4)), id(1, "b", cores(4))));
        BroadcastEnvelope env = new BroadcastEnvelope(7, 1L, 0L, topo,
                List.of(cpuFrame(0, 400f), cpuFrame(1, 400f)), List.of());
        // Host a's util counts only worker 0 (4 cores pegged) → 100, not diluted.
        assertThat(utilOf(env, "a")).isCloseTo(100.0, within(1e-9));
    }
}
