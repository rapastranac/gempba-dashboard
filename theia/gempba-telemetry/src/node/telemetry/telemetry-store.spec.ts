import { expect } from 'chai';
import { WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, NodeFrame, WorkerFrame } from '../protocol/wire-protocol';
import { TelemetryStore } from './telemetry-store';
import { WorldSnapshotMapper } from './world-snapshot-mapper';

function cpuFrame(id: number, cpu: number): WorkerFrame {
    return {
        worker_id: id, seq_no: 1, worker_local_ms: 0, tasks_local_total: 0, tasks_sent_total: 0, tasks_recv_total: 0,
        tasks_running: 0, scheduler_pending_count: 0, idle_microseconds_per_worker: 0,
        process_cpu_pct: cpu, process_rss_bytes: 0, process_threads: 1, edges_out: []
    };
}

function nodeFrame(): NodeFrame {
    return {
        sentinel_worker_id: 0, sentinel_local_ms: 0, hostname: 'h', socket_count: 1, logical_cores: 4,
        mem_total_bytes: 1000, mem_avail_bytes: 250, cgroup_mem_used_bytes: 0, cgroup_mem_limit_bytes: 0
    };
}

/** Host "h", worker 0 pegging a 4-core allocation. */
function withTopology(ts: number): BroadcastEnvelope {
    return {
        version: 7, ts, elapsed_seconds: 0,
        topology: {
            nodes: [{ hostname: 'h', sentinel_worker_id: 0, total_physical_cores: 0, total_logical_cores: 0, mem_total_bytes: 0, worker_ids: [0], sockets: [] }],
            identities: [{ worker_id: 0, hostname: 'h', pid: 1000, primary_socket: 0, allowed_cpu_ids: [0, 1, 2, 3] }]
        },
        workers: [cpuFrame(0, 400)],
        nodes: [nodeFrame()]
    };
}

function withoutTopology(ts: number, nodes?: NodeFrame[]): BroadcastEnvelope {
    return { version: 7, ts, elapsed_seconds: 0, topology: undefined, workers: [cpuFrame(0, 400)], nodes };
}

describe('TelemetryStore', () => {

    it('maps a missing envelope to the empty model', () => {
        expect(new TelemetryStore().ingest(undefined)).to.deep.equal(WorldSnapshot.empty());
    });

    it('caches the topology so a frame without one stays complete', () => {
        const store = new TelemetryStore();
        const first = store.ingest(withTopology(1));
        expect(first.nodes.map(n => n.host)).to.deep.equal(['h']);
        expect(first.nodes[0].nodeUtilPct).to.be.closeTo(100, 1e-9);

        const second = store.ingest(withoutTopology(2, [nodeFrame()]));
        expect(second.nodes.map(n => n.host)).to.deep.equal(['h']);
        expect(second.nodes[0].nodeUtilPct).to.be.closeTo(100, 1e-9);
    });

    it('without a cached topology, a frame without one maps as is', () => {
        const model = new TelemetryStore().ingest(withoutTopology(1));
        expect(model.nodes.map(n => n.host)).to.deep.equal([WorldSnapshotMapper.UNKNOWN_HOST]);
    });

    it('reset forgets the cached topology', () => {
        const store = new TelemetryStore();
        store.ingest(withTopology(1));
        store.reset();
        expect(store.ingest(withoutTopology(2)).nodes.map(n => n.host)).to.deep.equal([WorldSnapshotMapper.UNKNOWN_HOST]);
    });
});
