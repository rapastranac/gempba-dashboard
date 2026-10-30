import { expect } from 'chai';
import { StructureKey } from '../model/structure-key';
import { WorldSnapshot } from '../model/world-snapshot';
import { NodeHistoryStore } from './node-history-store';
import { NodeSeries } from './node-series';

function oneNode(timestampMillis: number, host: string, hasLiveMemory: boolean, nodeUtilPct: number,
    memUsedBytes: number, memTotalBytes: number): WorldSnapshot {
    return {
        schemaVersion: 1, timestampMillis, elapsedSeconds: 0, structure: StructureKey.empty(),
        nodes: [{
            host, socketCount: 1, physicalCores: 0, logicalCores: 1, hasLiveMemory, memTotalBytes, memUsedBytes,
            sentinelWorkerId: 0, sentinelLocalMillis: 0, nodeUtilPct, sockets: []
        }]
    };
}

describe('NodeHistoryStore', () => {

    it('appends a sample with utilization and memory', () => {
        const store = new NodeHistoryStore();
        store.update(oneNode(1_000, 'h', true, 100, 750, 1000));
        const series = store.seriesFor('h');
        expect(series.cpu).to.deep.equal([100]);
        expect(series.mem).to.deep.equal([750]);
        expect(series.cpuLatest).to.equal(100);
        expect(series.memUsedLatest).to.equal(750);
        expect(series.memTotalLatest).to.equal(1000);
    });

    it('a node without live memory adds no sample', () => {
        const store = new NodeHistoryStore();
        store.update(oneNode(5, 'h', false, 0, 0, 0));
        expect(store.hosts()).to.be.empty;
        expect(NodeSeries.isEmpty(store.seriesFor('h'))).to.be.true;
    });

    it('the buffer is capped and drops the oldest samples', () => {
        const store = new NodeHistoryStore();
        const n = NodeHistoryStore.CAPACITY + 10;
        for (let i = 0; i < n; i++) {
            store.update(oneNode(i, 'h', true, i, 2 * i, 1000));
        }
        const series = store.seriesFor('h');
        expect(series.cpu).to.have.lengthOf(NodeHistoryStore.CAPACITY);
        expect(series.cpu[0]).to.equal(10);
        expect(series.cpuLatest).to.equal(n - 1);
        expect(series.mem).to.have.lengthOf(NodeHistoryStore.CAPACITY);
        expect([series.mem[0], series.mem[series.mem.length - 1]]).to.deep.equal([20, 2 * (n - 1)]);
    });

    it('memory is sampled with CPU, so both series line up', () => {
        const store = new NodeHistoryStore();
        store.update(oneNode(1, 'h', true, 10, 100, 1000));
        store.update(oneNode(2, 'h', false, 0, 0, 0));
        store.update(oneNode(3, 'h', true, 30, 300, 1000));
        const series = store.seriesFor('h');
        expect([series.cpu, series.mem]).to.deep.equal([[10, 30], [100, 300]]);
    });

    it('history survives a frame where the node has no live memory', () => {
        const store = new NodeHistoryStore();
        store.update(oneNode(1, 'h', true, 100, 0, 100));
        store.update(oneNode(2, 'h', false, 0, 0, 0));
        store.update(oneNode(3, 'h', true, 50, 0, 100));
        expect(store.seriesFor('h').cpu).to.deep.equal([100, 50]);
    });

    it('clear drops the history', () => {
        const store = new NodeHistoryStore();
        store.update(oneNode(1, 'h', true, 100, 0, 100));
        store.clear();
        expect(store.hosts()).to.be.empty;
        expect(NodeSeries.isEmpty(store.seriesFor('h'))).to.be.true;
    });

    it('seriesFor an unknown host is empty', () => {
        expect(NodeSeries.isEmpty(new NodeHistoryStore().seriesFor('nope'))).to.be.true;
    });

    it('a missing snapshot is a no-op', () => {
        const store = new NodeHistoryStore();
        store.update(undefined);
        expect(store.hosts()).to.be.empty;
    });

    it('a returned series is a copy, unaffected by later frames', () => {
        const store = new NodeHistoryStore();
        store.update(oneNode(1, 'h', true, 10, 40, 100));
        const series = store.seriesFor('h');
        store.update(oneNode(2, 'h', true, 20, 50, 100));
        expect([series.cpu, series.mem]).to.deep.equal([[10], [40]]);
    });
});
