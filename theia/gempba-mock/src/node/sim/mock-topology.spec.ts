import { expect } from 'chai';
import { MockConfig, MockShape } from '../../common/mock-config';
import { MockTopology } from './mock-topology';

describe('MockTopology', () => {

    const shape = (overrides: Partial<MockShape> = {}): MockShape => ({ ...MockConfig.defaults().shape, ...overrides });

    it('names the nodes, numbers the ranks, and alternates them over the sockets', () => {
        const topology = MockTopology.of(shape());
        expect(topology.nodes.map(node => node.host)).to.deep.equal(['mock-host-01', 'mock-host-02']);
        expect(topology.ranks.map(rank => rank.id)).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7]);
        expect(topology.ranks.map(rank => `${rank.nodeIndex}/${rank.socketId}`))
            .to.deep.equal(['0/0', '0/1', '0/0', '0/1', '1/0', '1/1', '1/0', '1/1']);
        expect(topology.nodes[1].sockets.map(socket => socket.cpuIds)).to.deep.equal([[0, 1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14, 15]]);
        expect(topology.nodes[1].memTotalBytes).to.equal(64 * 1024 ** 3);
        expect(MockTopology.sentinelOf(topology, 1)).to.equal(4);
    });

    it('pins each rank to a disjoint slice of its socket, one pool thread per CPU unless told otherwise', () => {
        const ranks = MockTopology.of(shape()).ranks.filter(rank => rank.nodeIndex === 0);
        expect(ranks.map(rank => rank.allowedCpuIds)).to.deep.equal([[0, 1, 2, 3], [8, 9, 10, 11], [4, 5, 6, 7], [12, 13, 14, 15]]);
        expect(ranks.map(rank => rank.poolThreads)).to.deep.equal([4, 4, 4, 4]);
        expect(MockTopology.of(shape({ poolThreads: 6 })).ranks[0].poolThreads).to.equal(6);
    });

    it('numbers SMT siblings after every socket, and gives whole cores with their siblings', () => {
        const topology = MockTopology.of(shape({ nodes: 1, smt: true }));
        expect(topology.nodes[0].logicalCores).to.equal(32);
        expect(topology.nodes[0].sockets[0].cpuIds).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19, 20, 21, 22, 23]);
        expect(topology.ranks[0].allowedCpuIds).to.deep.equal([0, 1, 2, 3, 16, 17, 18, 19]);
        expect(topology.ranks[0].poolThreads).to.equal(8);
    });

    it('gives the first ranks the remainder, and one CPU each in turn when they outnumber the CPUs', () => {
        const uneven = MockTopology.of(shape({ nodes: 1, socketsPerNode: 1, coresPerSocket: 3, ranksPerNode: 2 }));
        expect(uneven.ranks.map(rank => rank.allowedCpuIds)).to.deep.equal([[0, 1], [2]]);
        const crowded = MockTopology.of(shape({ nodes: 1, socketsPerNode: 1, coresPerSocket: 2, ranksPerNode: 3 }));
        expect(crowded.ranks.map(rank => rank.allowedCpuIds)).to.deep.equal([[0], [1], [0]]);
    });

    it('adds a rank on the least crowded socket and slices the node again, keeping pool sizes', () => {
        const before = MockTopology.of(shape({ ranksPerNode: 3 }));
        const after = MockTopology.withRank(before, shape({ ranksPerNode: 3 }), 1);
        const added = after.ranks.find(rank => rank.id === 6)!;
        expect(added).to.include({ nodeIndex: 1, socketId: 1 });
        expect(added.allowedCpuIds).to.deep.equal([12, 13, 14, 15]);
        expect(after.ranks.find(rank => rank.id === 4)!.poolThreads).to.equal(8);
        expect(after.ranks.find(rank => rank.id === 4)!.allowedCpuIds).to.deep.equal([8, 9, 10, 11]);
    });

    it('removes a rank, moving the sentinel when it was the first', () => {
        const topology = MockTopology.of(shape());
        const after = MockTopology.withoutRank(topology, shape(), 4);
        expect(after.ranks.map(rank => rank.id)).to.deep.equal([0, 1, 2, 3, 5, 6, 7]);
        expect(MockTopology.sentinelOf(after, 1)).to.equal(5);
        expect(MockTopology.withoutRank(topology, shape(), 99)).to.equal(topology);
    });

    it('describes itself as gempba does, with each rank\'s process id', () => {
        const wire = MockTopology.toWire(MockTopology.of(shape()), id => 10_000 + id);
        expect(wire.nodes![1]).to.include({ hostname: 'mock-host-02', sentinel_worker_id: 4, total_physical_cores: 16, total_logical_cores: 16 });
        expect(wire.nodes![1].worker_ids).to.deep.equal([4, 5, 6, 7]);
        expect(wire.nodes![1].sockets![0]).to.deep.include({ socket_id: 0, name: 'Mock 8-core CPU', cpu_ids: [0, 1, 2, 3, 4, 5, 6, 7] });
        expect(wire.identities![5]).to.deep.equal({ worker_id: 5, hostname: 'mock-host-02', pid: 10_005, primary_socket: 1, allowed_cpu_ids: [8, 9, 10, 11] });
    });
});
