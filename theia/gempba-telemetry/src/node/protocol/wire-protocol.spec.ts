import { expect } from 'chai';
import { BroadcastEnvelope, ControlKind, ControlLine, WorkerFrame, WorkerIdentity } from './wire-protocol';

const CANONICAL_ENVELOPE = `{
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
          { "socket_id": 0, "name": "Test CPU 9000", "physical_cores": 8, "logical_cores": 16,
            "cpu_ids": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
          { "socket_id": 1, "name": "Test CPU 9000", "physical_cores": 8, "logical_cores": 16,
            "cpu_ids": [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31] }
        ]
      }
    ],
    "identities": [
      { "worker_id": 0, "hostname": "host-a", "pid": 1234, "primary_socket": 0,
        "allowed_cpu_ids": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] },
      { "worker_id": 1, "hostname": "host-a", "pid": 1235, "primary_socket": 0, "allowed_cpu_ids": [0, 1, 2, 3] },
      { "worker_id": 2, "hostname": "host-a", "pid": 1236, "primary_socket": 1,
        "allowed_cpu_ids": [16, 17, 18, 19, 20, 21, 22, 23] }
    ]
  },
  "workers": [
    {
      "worker_id": 0, "seq_no": 17, "worker_local_ms": 1700000000000,
      "tasks_local_total": 12450, "tasks_sent_total": 619, "tasks_recv_total": 0,
      "tasks_running": 6, "scheduler_pending_count": 4, "idle_microseconds_per_worker": 3200,
      "process_cpu_pct": 87.3, "process_rss_bytes": 18874368, "process_threads": 12,
      "edges_out": [{ "to": 1, "bytes": 9120000, "count": 619 }]
    }
  ],
  "nodes": [
    {
      "sentinel_worker_id": 0, "sentinel_local_ms": 1700000000050, "hostname": "host-a",
      "socket_count": 2, "logical_cores": 32,
      "mem_total_bytes": 274877906944, "mem_avail_bytes": 137438953472,
      "sockets": [
        { "socket_id": 0, "cpu_pct": 78.5, "mem_total_bytes": 137438953472, "mem_used_bytes": 68719476736 },
        { "socket_id": 1, "cpu_pct": 56.0, "mem_total_bytes": 137438953472, "mem_used_bytes": 68719476736 }
      ],
      "net_aggregate": { "bytes_in": 12345, "bytes_out": 67890, "packets_in": 100, "packets_out": 200 },
      "disk_aggregate": { "read_bytes": 555, "write_bytes": 666 }
    }
  ]
}`;

describe('wire protocol', () => {

    it('parses a full broadcast envelope from the canonical wire format', () => {
        const envelope = BroadcastEnvelope.parse(CANONICAL_ENVELOPE);
        expect([envelope.version, envelope.ts, envelope.elapsed_seconds]).to.deep.equal([1, 1_700_000_000_123, 3_600]);

        const topologyNode = envelope.topology!.nodes![0];
        expect(envelope.topology!.nodes).to.have.lengthOf(1);
        expect(topologyNode.hostname).to.equal('host-a');
        expect(topologyNode.total_physical_cores).to.equal(16);
        expect(topologyNode.total_logical_cores).to.equal(32);
        expect(topologyNode.mem_total_bytes).to.equal(274_877_906_944);
        expect(topologyNode.worker_ids).to.deep.equal([0, 1, 2]);
        expect(topologyNode.sockets).to.have.lengthOf(2);
        expect(topologyNode.sockets![0].name).to.equal('Test CPU 9000');
        expect(topologyNode.sockets![0].logical_cores).to.equal(16);
        expect(topologyNode.sockets![0].cpu_ids).to.have.lengthOf(16);
        expect(topologyNode.sockets![1].cpu_ids![0]).to.equal(16);

        const identities = envelope.topology!.identities!;
        expect(identities).to.have.lengthOf(3);
        expect(identities[0].allowed_cpu_ids).to.have.lengthOf(16);
        expect(identities[1].allowed_cpu_ids).to.deep.equal([0, 1, 2, 3]);
        expect(identities[2].primary_socket).to.equal(1);

        const worker = envelope.workers![0];
        expect(envelope.workers).to.have.lengthOf(1);
        expect(worker.worker_id).to.equal(0);
        expect(worker.tasks_started_total).to.equal(12_450);
        // The two queue-like counters live at different layers and must map independently.
        expect(worker.tasks_running).to.equal(6);
        expect(worker.scheduler_pending_count).to.equal(4);
        expect(worker.process_cpu_pct).to.equal(87.3);
        expect(worker.edges_out).to.deep.equal([{ to: 1, bytes: 9_120_000, count: 619 }]);

        const node = envelope.nodes![0];
        expect(envelope.nodes).to.have.lengthOf(1);
        expect(node.hostname).to.equal('host-a');
        expect(node.socket_count).to.equal(2);
        expect(node.logical_cores).to.equal(32);
        expect(node.mem_total_bytes).to.equal(274_877_906_944);
        expect(node.sockets).to.have.lengthOf(2);
        expect(node.sockets![0].cpu_pct).to.equal(78.5);
        expect(node.net_aggregate!.bytes_in).to.equal(12_345);
        expect(node.disk_aggregate!.write_bytes).to.equal(666);
    });

    it('ignores unknown top-level fields for forward compatibility', () => {
        const envelope = BroadcastEnvelope.parse(`{
            "version": 1, "ts": 0, "topology": { "nodes": [], "identities": [] },
            "workers": [], "nodes": [], "future_field": "the dashboard should not crash on this"
        }`);
        expect(envelope.workers).to.be.empty;
        expect(envelope.nodes).to.be.empty;
        expect(envelope).not.to.have.property('future_field');
    });

    it('an identity with a full cpu id list round-trips without a 64-CPU cap', () => {
        const allowed = Array.from({ length: 68 }, (_, i) => i);
        const identity = WorkerIdentity.fromJson(JSON.parse(JSON.stringify({
            worker_id: 0, hostname: 'host-a', pid: 1234, primary_socket: 0, allowed_cpu_ids: allowed
        })));
        expect(identity.allowed_cpu_ids).to.have.lengthOf(68);
        expect(identity.allowed_cpu_ids![67]).to.equal(67);
    });

    it('an empty edges_out round-trips', () => {
        const frame = WorkerFrame.fromJson(JSON.parse(`{
            "worker_id": 5, "seq_no": 1, "worker_local_ms": 0, "tasks_local_total": 0, "tasks_sent_total": 0,
            "tasks_recv_total": 0, "tasks_running": 0, "scheduler_pending_count": 0,
            "idle_microseconds_per_worker": 0, "process_cpu_pct": 0.0, "process_rss_bytes": 0,
            "process_threads": 1, "edges_out": []
        }`));
        expect(frame.worker_id).to.equal(5);
        expect(frame.edges_out).to.be.empty;
    });
});

describe('ControlLine', () => {

    it('formats one newline-terminated JSON line per message', () => {
        expect(ControlLine.format(ControlKind.SetWorkerIntervalMs, 2500)).to.equal('{"kind":"set_worker_interval_ms","value":2500}\n');
        expect(ControlLine.format(ControlKind.SetNodeIntervalMs, 1000)).to.equal('{"kind":"set_node_interval_ms","value":1000}\n');
    });

    it('does not pre-clamp the value; gempba clamps it', () => {
        expect(ControlLine.parse(ControlLine.format(ControlKind.SetWorkerIntervalMs, 10)))
            .to.deep.equal({ kind: ControlKind.SetWorkerIntervalMs, value: 10 });
    });

    it('parses a line with surrounding whitespace', () => {
        expect(ControlLine.parse('{ "kind": " set_node_interval_ms ", "value": 750 }\r'))
            .to.deep.equal({ kind: ControlKind.SetNodeIntervalMs, value: 750 });
    });

    it('reads anything malformed or unknown as undefined', () => {
        const lines = [
            'not json', '[]', '{"kind":"set_rate","value":1}', '{"kind":"set_worker_interval_ms"}',
            '{"kind":"set_worker_interval_ms","value":"500"}', '{"kind":"set_worker_interval_ms","value":-1}',
            '{"kind":"set_worker_interval_ms","value":2.5}', '{"kind":"set_worker_interval_ms","value":true}'
        ];
        for (const line of lines) {
            expect(ControlLine.parse(line), line).to.equal(undefined);
        }
    });
});
