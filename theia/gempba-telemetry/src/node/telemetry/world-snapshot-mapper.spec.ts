import { expect } from 'chai';
import { NodeSnapshot, WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, EdgeOut, NodeFrame, Topology, TopologyNode, TopologySocket, RankFrame, RankIdentity } from '../protocol/wire-protocol';
import { WorldSnapshotMapper } from './world-snapshot-mapper';

const GiB = 1024 ** 3;

function frame(id: number, seq: number, cpu: number, rss: number, edges?: EdgeOut[]): RankFrame {
    return {
        rank: id, seq_no: seq, rank_local_ms: 0, tasks_started_total: 100, tasks_sent_total: 20, tasks_recv_total: 5,
        tasks_running: 3, scheduler_pending_count: 7, idle_microseconds_per_thread: 1_000,
        process_cpu_pct: cpu, process_rss_bytes: rss, process_threads: 8, edges_out: edges
    };
}

function cpuFrame(id: number, cpu: number): RankFrame {
    return {
        rank: id, seq_no: 1, rank_local_ms: 0, tasks_started_total: 0, tasks_sent_total: 0, tasks_recv_total: 0,
        tasks_running: 0, scheduler_pending_count: 0, idle_microseconds_per_thread: 0,
        process_cpu_pct: cpu, process_rss_bytes: 0, process_threads: 1, edges_out: []
    };
}

function ident(id: number, hostname: string, pid: number, socket: number, allowed?: number[]): RankIdentity {
    return { rank: id, hostname, pid, primary_socket: socket, allowed_cpu_ids: allowed };
}

function id(rank: number, hostname: string, allowed?: number[]): RankIdentity {
    return ident(rank, hostname, 1000 + rank, 0, allowed);
}

function socket(socketId: number, name: string, physical: number, logical: number, cpuIds: number[]): TopologySocket {
    return { socket_id: socketId, name, physical_cores: physical, logical_cores: logical, cpu_ids: cpuIds };
}

function topologyNode(hostname: string, sentinel: number, physical: number, logical: number, memTotal: number,
    ranks: number[], sockets?: TopologySocket[]): TopologyNode {
    return {
        hostname, sentinel_rank: sentinel, total_physical_cores: physical, total_logical_cores: logical,
        mem_total_bytes: memTotal, ranks, sockets
    };
}

function nodeFrame(sentinel: number, hostname: string, socketCount: number, logical: number, memTotal: number,
    memAvail: number, cgroupUsed = 0, cgroupLimit = 0): NodeFrame {
    return {
        sentinel_rank: sentinel, sentinel_local_ms: 0, hostname, socket_count: socketCount, logical_cores: logical,
        mem_total_bytes: memTotal, mem_avail_bytes: memAvail, cgroup_mem_used_bytes: cgroupUsed, cgroup_mem_limit_bytes: cgroupLimit
    };
}

function envelope(topology: Topology | undefined, ranks: RankFrame[] | undefined, nodes: NodeFrame[] | undefined,
    ts = 1, elapsedSeconds = 0): BroadcastEnvelope {
    return { version: 7, ts, elapsed_seconds: elapsedSeconds, topology, ranks, nodes };
}

function cores(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
}

/** Two-socket node "n0": socket 0 = CPUs 0-3, socket 1 = CPUs 4-7. */
function twoSocketEnvelope(): BroadcastEnvelope {
    const n0 = topologyNode('n0', 10, 4, 8, 64 * GiB, [10, 11, 12], [
        socket(0, 'Xeon Gold', 2, 4, [0, 1, 2, 3]),
        socket(1, 'Xeon Gold', 2, 4, [4, 5, 6, 7])
    ]);
    const identities = [
        ident(10, 'n0', 1000, 0, [0, 1]),
        ident(11, 'n0', 1001, 1, undefined),
        ident(12, 'n0', 1002, 0, [])
    ];
    // Arrival order 10, 12, 11 interleaves sockets, so grouping must follow primary_socket.
    const ranks = [frame(10, 5, 80, 500_000, [{ to: 11, bytes: 4096, count: 3 }]), frame(12, 5, 25, 300_000), frame(11, 5, 50, 400_000, [])];
    return envelope({ nodes: [n0], identities }, ranks, [nodeFrame(10, 'n0', 2, 8, 64 * GiB, 24 * GiB)], 1_700_000_000_000, 42);
}

/** One host whose topology node owns exactly the given identities' ranks. */
function singleHost(host: string, ranks: RankFrame[], identities: RankIdentity[]): BroadcastEnvelope {
    const sentinel = identities.length === 0 ? -1 : identities[0].rank;
    const topology = { nodes: [topologyNode(host, sentinel, 0, 0, 0, identities.map(i => i.rank), [])], identities };
    return envelope(topology, ranks, []);
}

function utilOf(env: BroadcastEnvelope, host: string): number {
    const node = WorldSnapshotMapper.toWorldSnapshot(env).nodes.find(n => n.host === host);
    expect(node, `node ${host}`).to.not.be.undefined;
    return node!.nodeUtilPct;
}

function firstNode(env: BroadcastEnvelope): NodeSnapshot {
    return WorldSnapshotMapper.toWorldSnapshot(env).nodes[0];
}

describe('WorldSnapshotMapper', () => {

    it('maps a missing envelope to the empty model', () => {
        const model = WorldSnapshotMapper.toWorldSnapshot(undefined);
        expect(model).to.deep.equal(WorldSnapshot.empty());
        expect(WorldSnapshot.totalNodes(model)).to.equal(0);
        expect(WorldSnapshot.totalRanks(model)).to.equal(0);
    });

    it('carries the frame scalars and totals', () => {
        const model = WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope());
        expect(model.schemaVersion).to.equal(7);
        expect(model.timestampMillis).to.equal(1_700_000_000_000);
        expect(model.elapsedSeconds).to.equal(42);
        expect(WorldSnapshot.totalNodes(model)).to.equal(1);
        expect(WorldSnapshot.totalRanks(model)).to.equal(3);
    });

    it('resolves the node header fields', () => {
        const node = firstNode(twoSocketEnvelope());
        expect(node.host).to.equal('n0');
        expect(node.socketCount).to.equal(2);
        expect(node.physicalCores).to.equal(4);
        expect(node.logicalCores).to.equal(8);
        expect(node.hasLiveMemory).to.be.true;
        expect(node.memTotalBytes).to.equal(64 * GiB);
        expect(node.memUsedBytes).to.equal(40 * GiB);
        expect(node.sentinelRank).to.equal(10);
    });

    it('keeps the sentinel\'s clock from the node frame', () => {
        const base = twoSocketEnvelope();
        expect(firstNode({ ...base, nodes: [{ ...base.nodes![0], sentinel_local_ms: 77_000 }] }).sentinelLocalMillis).to.equal(77_000);
        expect(firstNode({ ...base, nodes: undefined }).sentinelLocalMillis).to.equal(0);
    });

    it('prefers cgroup memory over host memory when present', () => {
        const topology = {
            nodes: [topologyNode('n0', 10, 4, 8, 64 * GiB, [10], [socket(0, 'Xeon', 2, 4, [0, 1, 2, 3])])],
            identities: [ident(10, 'n0', 1000, 0, [0])]
        };
        const node = firstNode(envelope(topology, [frame(10, 1, 50, 0, [])],
            [nodeFrame(10, 'n0', 1, 8, 64 * GiB, 24 * GiB, 512 * 1024 * 1024, 8 * GiB)]));
        expect(node.memUsedBytes).to.equal(512 * 1024 * 1024);
        expect(node.memTotalBytes).to.equal(8 * GiB);
    });

    it('groups ranks into sockets in numeric order', () => {
        const node = firstNode(twoSocketEnvelope());
        expect(node.sockets.map(s => s.socketId)).to.deep.equal([0, 1]);
        const [s0, s1] = node.sockets;
        expect(s0.name).to.equal('Xeon Gold');
        expect(s0.logicalCores).to.equal(4);
        expect(s0.cpuIds).to.deep.equal([0, 1, 2, 3]);
        expect(s0.hasTopology).to.be.true;
        expect(s0.ranks.map(w => w.id)).to.deep.equal([10, 12]);
        expect(s1.ranks.map(w => w.id)).to.deep.equal([11]);
    });

    it('core usage intersects allowed cpus with the socket cpus', () => {
        const node = firstNode(twoSocketEnvelope());
        // rank 10: {0,1} ∩ {0,1,2,3} = 2; rank 12: empty list → all 4.
        expect(node.sockets[0].coreUsage.map(u => [u.rank, u.accessibleCores, u.socketCores]))
            .to.have.deep.members([[10, 2, 4], [12, 4, 4]]);
        // rank 11: no allowed list → all 4.
        expect(node.sockets[1].coreUsage.map(u => [u.rank, u.accessibleCores])).to.deep.equal([[11, 4]]);
    });

    it('maps rank counters and peers', () => {
        const node = firstNode(twoSocketEnvelope());
        const w10 = node.sockets[0].ranks[0];
        expect(w10.id).to.equal(10);
        expect(w10.seqNo).to.equal(5);
        expect(w10.pid).to.equal(1000);
        expect(w10.sentinel).to.be.true;
        expect(w10.tasksStartedTotal).to.equal(100);
        expect(w10.tasksRunning).to.equal(3);
        expect(w10.schedulerPendingCount).to.equal(7);
        expect(w10.cpuPct).to.equal(80);
        expect(w10.rssBytes).to.equal(500_000);
        expect(w10.threads).to.equal(8);
        expect(w10.elapsedSeconds).to.equal(42);
        expect(w10.peers).to.deep.equal([{ peerRank: 11, bytes: 4096, count: 3 }]);
        const w11 = node.sockets[1].ranks[0];
        expect(w11.sentinel).to.be.false;
        expect(w11.peers).to.be.empty;
    });

    it('keeps each rank\'s clock and the CPUs it may run on', () => {
        const base = twoSocketEnvelope();
        const ranks = base.ranks!.map(w => ({ ...w, rank_local_ms: 9_000 + w.rank }));
        const [s0, s1] = firstNode({ ...base, ranks }).sockets;
        expect(s0.ranks.map(w => [w.id, w.localMillis, w.allowedCpuIds])).to.deep.equal([[10, 9_010, [0, 1]], [12, 9_012, []]]);
        // rank 11 has no allowed list: unrestricted.
        expect(s1.ranks.map(w => [w.id, w.localMillis, w.allowedCpuIds])).to.deep.equal([[11, 9_011, []]]);
    });

    it('a rank without identity may run anywhere', () => {
        const rank = WorldSnapshotMapper.toWorldSnapshot(envelope(undefined, [frame(99, 1, 10, 1000)], undefined)).nodes[0].sockets[0].ranks[0];
        expect([rank.pid, rank.allowedCpuIds]).to.deep.equal([0, []]);
    });

    it('builds one structure key per rank', () => {
        expect(WorldSnapshotMapper.toWorldSnapshot(twoSocketEnvelope()).structure.keys)
            .to.have.members(['n0|0|10', 'n0|0|12', 'n0|1|11']);
    });

    it('a rank without identity or topology falls into the unknown host', () => {
        const model = WorldSnapshotMapper.toWorldSnapshot(envelope(undefined, [frame(99, 1, 10, 1000)], undefined));
        expect(WorldSnapshot.totalNodes(model)).to.equal(1);
        const node = model.nodes[0];
        expect(node.host).to.equal(WorldSnapshotMapper.UNKNOWN_HOST);
        expect(node.sockets).to.have.lengthOf(1);
        expect(node.sockets[0].socketId).to.equal(0);
        expect(node.sockets[0].hasTopology).to.be.false;
        expect(node.sockets[0].coreUsage).to.be.empty;
        expect(model.structure.keys).to.deep.equal(['(unknown host)|0|99']);
    });

    it('a node without a live frame uses the topology memory total', () => {
        const topology = {
            nodes: [topologyNode('n0', 10, 0, 4, 32 * GiB, [10], [socket(0, 'EPYC', 0, 4, [0, 1, 2, 3])])],
            identities: [ident(10, 'n0', 1, 0, undefined)]
        };
        const node = firstNode(envelope(topology, [frame(10, 1, 10, 1000)], undefined));
        expect(node.hasLiveMemory).to.be.false;
        expect(node.memUsedBytes).to.equal(0);
        expect(node.memTotalBytes).to.equal(32 * GiB);
        expect(node.physicalCores).to.equal(0);
    });

    it('forHost narrows the mapped model to one node', () => {
        const base = twoSocketEnvelope();
        const topology = {
            nodes: [...base.topology!.nodes!, topologyNode('n1', 20, 4, 8, 0, [20], [])],
            identities: [...base.topology!.identities!, ident(20, 'n1', 2000, 0, undefined)]
        };
        const full = WorldSnapshotMapper.toWorldSnapshot({ ...base, topology, ranks: [...base.ranks!, frame(20, 1, 5, 100)] });
        expect(WorldSnapshot.totalNodes(full)).to.equal(2);
        const only0 = WorldSnapshot.forHost(full, 'n0');
        expect(only0.nodes.map(n => n.host)).to.deep.equal(['n0']);
        expect(WorldSnapshot.totalRanks(only0)).to.equal(3);
        expect(only0.structure.keys).to.have.members(['n0|0|10', 'n0|0|12', 'n0|1|11']);
        const none = WorldSnapshot.forHost(full, 'does-not-exist');
        expect(none.nodes).to.be.empty;
        expect(none.schemaVersion).to.equal(7);
    });

    it('four cores pegged over a four-core allocation is 100', () => {
        expect(utilOf(singleHost('h', [cpuFrame(0, 400)], [id(0, 'h', cores(4))]), 'h')).to.be.closeTo(100, 1e-9);
    });

    it('ten cores busy over a twenty-core allocation is 50', () => {
        expect(utilOf(singleHost('h', [cpuFrame(0, 1000)], [id(0, 'h', cores(20))]), 'h')).to.be.closeTo(50, 1e-9);
    });

    it('an idle allocation is zero', () => {
        expect(utilOf(singleHost('h', [cpuFrame(0, 0)], [id(0, 'h', cores(4))]), 'h')).to.equal(0);
    });

    it('oversubscription clamps to 100', () => {
        expect(utilOf(singleHost('h', [cpuFrame(0, 500)], [id(0, 'h', cores(4))]), 'h')).to.equal(100);
    });

    it('a rank without identity contributes no allocation, so utilization is zero', () => {
        const topology = { nodes: [topologyNode('h', 0, 0, 0, 0, [0], [])], identities: [] };
        expect(utilOf(envelope(topology, [cpuFrame(0, 400)], []), 'h')).to.equal(0);
    });

    it('an empty allocation is zero', () => {
        expect(utilOf(singleHost('h', [cpuFrame(0, 400)], [id(0, 'h', [])]), 'h')).to.equal(0);
    });

    it('aggregates several ranks with disjoint allocations', () => {
        const env = singleHost('h', [cpuFrame(0, 200), cpuFrame(1, 200)], [id(0, 'h', [0, 1]), id(1, 'h', [2, 3])]);
        expect(utilOf(env, 'h')).to.be.closeTo(100, 1e-9);
    });

    it('utilization excludes ranks on other hosts', () => {
        const topology = {
            nodes: [topologyNode('a', 0, 0, 0, 0, [0], []), topologyNode('b', 1, 0, 0, 0, [1], [])],
            identities: [id(0, 'a', cores(4)), id(1, 'b', cores(4))]
        };
        expect(utilOf(envelope(topology, [cpuFrame(0, 400), cpuFrame(1, 400)], []), 'a')).to.be.closeTo(100, 1e-9);
    });
});
