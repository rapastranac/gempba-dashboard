import { expect } from 'chai';
import { ChartCatalog } from './chart-catalog';

describe('ChartCatalog', () => {

    it('shows a rank its CPU, tasks started so far and idle time by default, and a node its CPU, tasks started so far and memory', () => {
        expect(ChartCatalog.DEFAULTS.rank.map(ChartCatalog.key)).to.deep.equal(['cpu', 'tasks-started:total', 'idle']);
        expect(ChartCatalog.DEFAULTS.node.map(ChartCatalog.key)).to.deep.equal(['cpu', 'tasks-started:total', 'memory']);
    });

    it('offers a rank CPU, memory, idle time and the six counts, and a node the same but idle time', () => {
        expect(ChartCatalog.IDS.rank).to.deep.equal(['cpu', 'memory', 'idle', 'tasks-started', 'tasks-local', 'tasks-sent', 'tasks-received', 'bytes-sent', 'bytes-received']);
        expect(ChartCatalog.IDS.node).to.deep.equal(ChartCatalog.IDS.rank.filter(id => id !== 'idle'));
        expect(ChartCatalog.IDS.rank.map(ChartCatalog.label)).to.deep.equal([
            'CPU', 'Memory', 'Idle', 'Tasks started', 'Tasks run locally', 'Tasks sent', 'Tasks received', 'Bytes sent', 'Bytes received'
        ]);
    });

    it('saves a level by its id and a count with its form', () => {
        expect([{ id: 'memory' }, { id: 'bytes-sent', form: 'rate' }, { id: 'tasks-local' }].map(tile => ChartCatalog.key(tile as ChartCatalog.Tile)))
            .to.deep.equal(['memory', 'bytes-sent:rate', 'tasks-local:total']);
    });

    it('restores a saved layout in its order, a count without a form as its running total', () => {
        expect(ChartCatalog.read('rank', ['bytes-sent:rate', 'idle', ' tasks-sent ', 'cpu'])).to.deep.equal([
            { id: 'bytes-sent', form: 'rate' }, { id: 'idle' }, { id: 'tasks-sent', form: 'total' }, { id: 'cpu' }
        ]);
    });

    it('leaves out unknown tiles, wrong forms, repeats, and a tile the kind of panel has none of', () => {
        expect(ChartCatalog.read('rank', ['cpu', 'gpu', 'idle:rate', 'tasks-sent:hourly', 'cpu', 'memory:total:x', 7, 'tasks-sent', 'tasks-sent:total']))
            .to.deep.equal([{ id: 'cpu' }, { id: 'tasks-sent', form: 'total' }]);
        expect(ChartCatalog.read('node', ['idle', 'memory'])).to.deep.equal([{ id: 'memory' }]);
    });

    it('reads anything but a list as the default, and keeps an emptied layout empty', () => {
        expect(ChartCatalog.read('node', undefined)).to.deep.equal(ChartCatalog.DEFAULTS.node);
        expect(ChartCatalog.read('rank', 'cpu')).to.deep.equal(ChartCatalog.DEFAULTS.rank);
        expect(ChartCatalog.read('rank', [])).to.deep.equal([]);
    });
});
