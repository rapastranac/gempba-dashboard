import { expect } from 'chai';
import { NodeHistoryStore, NodeSnapshot, WorldSnapshot } from '@gempba/core';
import { GridTiles } from './grid-tiles';

const GiB = 1024 ** 3;

function node(host: string, nodeUtilPct: number, live: boolean): NodeSnapshot {
    return {
        host, socketCount: 1, physicalCores: 4, logicalCores: 4, hasLiveMemory: live, memTotalBytes: 16 * GiB,
        memUsedBytes: 4 * GiB, sentinelWorkerId: 0, sentinelLocalMillis: 0, nodeUtilPct, sockets: []
    };
}

function snapshot(...nodes: NodeSnapshot[]): WorldSnapshot {
    return { ...WorldSnapshot.empty(), timestampMillis: 1, nodes };
}

describe('GridTiles', () => {

    it('has no tiles before the first snapshot', () => {
        expect(GridTiles.of(undefined, new NodeHistoryStore())).to.deep.equal([]);
    });

    it('makes one tile per node, in snapshot order, with its history and memory', () => {
        const history = new NodeHistoryStore();
        history.update(snapshot(node('beta', 40, true), node('alpha', 60, true)));
        const latest = snapshot(node('beta', 41.6, true), node('alpha', 59.4, true));
        history.update(latest);
        expect(GridTiles.of(latest, history)).to.deep.equal([
            { host: 'beta', cpuText: '42%', cpuHistory: [40, 41.6], memoryText: 'Memory 4.0 GB / 16.0 GB', memoryFraction: 0.25 },
            { host: 'alpha', cpuText: '59%', cpuHistory: [60, 59.4], memoryText: 'Memory 4.0 GB / 16.0 GB', memoryFraction: 0.25 }
        ]);
    });

    it('shows a dash for memory until the node reports it', () => {
        const history = new NodeHistoryStore();
        const latest = snapshot(node('gamma', 10, false));
        history.update(latest);
        expect(GridTiles.of(latest, history)).to.deep.equal([
            { host: 'gamma', cpuText: '10%', cpuHistory: [], memoryText: 'Memory —', memoryFraction: 0 }
        ]);
    });

    it('graphs a full window of the kept history', () => {
        expect(GridTiles.HISTORY_CAPACITY).to.equal(NodeHistoryStore.CAPACITY);
    });
});
