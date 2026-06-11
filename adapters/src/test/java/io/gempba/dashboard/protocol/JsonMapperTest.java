package io.gempba.dashboard.protocol;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class JsonMapperTest {

    private ObjectMapper mapper;

    @BeforeEach
    void setUp() {
        mapper = JsonMapper.create();
    }

    @Test
    void parses_full_broadcast_envelope_from_canonical_wire_format() throws Exception {
        String json = """
                {
                  "version": 1,
                  "ts": 1700000000123,
                  "elapsed_seconds": 3600,
                  "topology": {
                    "nodes": [
                      {
                        "hostname": "host-a",
                        "sentinel_worker_id": 0,
                        "total_physical_cores": 16,
                        "total_logical_cores": 32,
                        "mem_total_bytes": 274877906944,
                        "worker_ids": [0, 1, 2],
                        "sockets": [
                          {
                            "socket_id": 0,
                            "name": "Test CPU 9000",
                            "physical_cores": 8,
                            "logical_cores": 16,
                            "cpu_ids": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]
                          },
                          {
                            "socket_id": 1,
                            "name": "Test CPU 9000",
                            "physical_cores": 8,
                            "logical_cores": 16,
                            "cpu_ids": [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31]
                          }
                        ]
                      }
                    ],
                    "identities": [
                      {"worker_id": 0, "hostname": "host-a", "pid": 1234, "primary_socket": 0,
                       "allowed_cpu_ids": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]},
                      {"worker_id": 1, "hostname": "host-a", "pid": 1235, "primary_socket": 0,
                       "allowed_cpu_ids": [0, 1, 2, 3]},
                      {"worker_id": 2, "hostname": "host-a", "pid": 1236, "primary_socket": 1,
                       "allowed_cpu_ids": [16, 17, 18, 19, 20, 21, 22, 23]}
                    ]
                  },
                  "workers": [
                    {
                      "worker_id": 0,
                      "seq_no": 17,
                      "worker_local_ms": 1700000000000,
                      "tasks_local_total": 12450,
                      "tasks_sent_total": 619,
                      "tasks_recv_total": 0,
                      "tasks_running": 6,
                      "scheduler_pending_count": 4,
                      "idle_microseconds_per_worker": 3200,
                      "process_cpu_pct": 87.3,
                      "process_rss_bytes": 18874368,
                      "process_threads": 12,
                      "edges_out": [{"to": 1, "bytes": 9120000, "count": 619}]
                    }
                  ],
                  "nodes": [
                    {
                      "sentinel_worker_id": 0,
                      "sentinel_local_ms": 1700000000050,
                      "hostname": "host-a",
                      "socket_count": 2,
                      "logical_cores": 32,
                      "mem_total_bytes": 274877906944,
                      "mem_avail_bytes": 137438953472,
                      "sockets": [
                        {"socket_id": 0, "cpu_pct": 78.5, "mem_total_bytes": 137438953472, "mem_used_bytes": 68719476736},
                        {"socket_id": 1, "cpu_pct": 56.0, "mem_total_bytes": 137438953472, "mem_used_bytes": 68719476736}
                      ],
                      "net_aggregate": {"bytes_in": 12345, "bytes_out": 67890, "packets_in": 100, "packets_out": 200},
                      "disk_aggregate": {"read_bytes": 555, "write_bytes": 666}
                    }
                  ]
                }
                """;

        BroadcastEnvelope env = mapper.readValue(json, BroadcastEnvelope.class);

        assertThat(env.version()).isEqualTo(1);
        assertThat(env.ts()).isEqualTo(1_700_000_000_123L);
        assertThat(env.elapsedSeconds()).isEqualTo(3_600L);

        assertThat(env.topology().nodes()).hasSize(1);
        TopologyNode tn = env.topology().nodes().get(0);
        assertThat(tn.hostname()).isEqualTo("host-a");
        assertThat(tn.totalPhysicalCores()).isEqualTo(16);
        assertThat(tn.totalLogicalCores()).isEqualTo(32);
        assertThat(tn.memTotalBytes()).isEqualTo(274_877_906_944L);
        assertThat(tn.workerIds()).containsExactly(0L, 1L, 2L);
        assertThat(tn.sockets()).hasSize(2);
        assertThat(tn.sockets().get(0).name()).isEqualTo("Test CPU 9000");
        assertThat(tn.sockets().get(0).logicalCores()).isEqualTo(16);
        assertThat(tn.sockets().get(0).cpuIds()).hasSize(16);
        assertThat(tn.sockets().get(1).cpuIds().get(0)).isEqualTo(16);

        assertThat(env.topology().identities()).hasSize(3);
        assertThat(env.topology().identities().get(0).allowedCpuIds()).hasSize(16);
        assertThat(env.topology().identities().get(1).allowedCpuIds()).containsExactly(0, 1, 2, 3);
        assertThat(env.topology().identities().get(2).primarySocket()).isEqualTo(1);

        assertThat(env.workers()).hasSize(1);
        WorkerFrame w = env.workers().get(0);
        assertThat(w.workerId()).isEqualTo(0L);
        assertThat(w.tasksLocalTotal()).isEqualTo(12450L);
        // The two queue-like counters live at different layers and must
        // round-trip independently; same-named JSON fields would mask a
        // mapping mistake here.
        assertThat(w.tasksRunning()).isEqualTo(6);
        assertThat(w.schedulerPendingCount()).isEqualTo(4);
        assertThat(w.processCpuPct()).isEqualTo(87.3f);
        assertThat(w.edgesOut()).hasSize(1);
        assertThat(w.edgesOut().get(0).to()).isEqualTo(1);
        assertThat(w.edgesOut().get(0).bytes()).isEqualTo(9_120_000L);

        assertThat(env.nodes()).hasSize(1);
        NodeFrame n = env.nodes().get(0);
        assertThat(n.hostname()).isEqualTo("host-a");
        assertThat(n.socketCount()).isEqualTo(2);
        assertThat(n.logicalCores()).isEqualTo(32);
        assertThat(n.memTotalBytes()).isEqualTo(274_877_906_944L);
        assertThat(n.sockets()).hasSize(2);
        assertThat(n.sockets().get(0).cpuPct()).isEqualTo(78.5f);
        assertThat(n.netAggregate().bytesIn()).isEqualTo(12_345L);
        assertThat(n.diskAggregate().writeBytes()).isEqualTo(666L);
    }

    @Test
    void ignores_unknown_top_level_fields_for_forward_compat() throws Exception {
        String json = """
                {
                  "version": 1,
                  "ts": 0,
                  "topology": {"nodes": [], "identities": []},
                  "workers": [],
                  "nodes": [],
                  "future_field": "the dashboard should not crash on this"
                }
                """;
        BroadcastEnvelope env = mapper.readValue(json, BroadcastEnvelope.class);
        assertThat(env.workers()).isEmpty();
        assertThat(env.nodes()).isEmpty();
    }

    @Test
    void identity_with_full_cpu_id_list_round_trips() throws Exception {
        // The C++ topology builder enumerates every logical CPU when no
        // affinity is set. The Java side must accept arbitrarily long
        // arrays without imposing a 64-CPU cap (the previous bitmap-based
        // representation did).
        String json = """
                {
                  "worker_id": 0,
                  "hostname": "host-a",
                  "pid": 1234,
                  "primary_socket": 0,
                  "allowed_cpu_ids": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
                                      10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                                      20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
                                      30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
                                      40, 41, 42, 43, 44, 45, 46, 47, 48, 49,
                                      50, 51, 52, 53, 54, 55, 56, 57, 58, 59,
                                      60, 61, 62, 63, 64, 65, 66, 67]
                }
                """;
        WorkerIdentity ident = mapper.readValue(json, WorkerIdentity.class);
        assertThat(ident.allowedCpuIds()).hasSize(68);
        assertThat(ident.allowedCpuIds().get(67)).isEqualTo(67);
    }

    @Test
    void empty_edges_out_round_trips() throws Exception {
        String json = """
                {
                  "worker_id": 5,
                  "seq_no": 1,
                  "worker_local_ms": 0,
                  "tasks_local_total": 0,
                  "tasks_sent_total": 0,
                  "tasks_recv_total": 0,
                  "tasks_running": 0,
                  "scheduler_pending_count": 0,
                  "idle_microseconds_per_worker": 0,
                  "process_cpu_pct": 0.0,
                  "process_rss_bytes": 0,
                  "process_threads": 1,
                  "edges_out": []
                }
                """;
        WorkerFrame frame = mapper.readValue(json, WorkerFrame.class);
        assertThat(frame.workerId()).isEqualTo(5L);
        assertThat(frame.edgesOut()).isEmpty();
    }
}
