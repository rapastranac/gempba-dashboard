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

    describe('editing a layout', () => {

        const layout: ChartCatalog.Tile[] = [{ id: 'cpu' }, { id: 'tasks-started', form: 'total' }, { id: 'idle' }];
        const keys = (tiles: readonly ChartCatalog.Tile[]) => tiles.map(ChartCatalog.key);

        it('adds a level once, and a count as its running total, then as its rate, then no more', () => {
            expect([ChartCatalog.canAdd(layout, 'cpu'), keys(ChartCatalog.add(layout, 'cpu'))]).to.deep.equal([false, keys(layout)]);
            expect(keys(ChartCatalog.add(layout, 'bytes-sent'))).to.deep.equal(['cpu', 'tasks-started:total', 'idle', 'bytes-sent:total']);
            const both = ChartCatalog.add(layout, 'tasks-started');
            expect(keys(both)).to.deep.equal(['cpu', 'tasks-started:total', 'idle', 'tasks-started:rate']);
            expect(ChartCatalog.canAdd(both, 'tasks-started')).to.equal(false);
        });

        it('swaps a tile for another, a count keeping its form, never for one already shown', () => {
            expect(keys(ChartCatalog.swap(layout, 1, 'tasks-local'))).to.deep.equal(['cpu', 'tasks-local:total', 'idle']);
            expect(keys(ChartCatalog.swap(layout, 0, 'bytes-received'))).to.deep.equal(['bytes-received:total', 'tasks-started:total', 'idle']);
            expect(keys(ChartCatalog.swap(layout, 1, 'memory'))).to.deep.equal(['cpu', 'memory', 'idle']);
            expect([ChartCatalog.canSwap(layout, 0, 'idle'), ChartCatalog.canSwap(layout, 0, 'cpu'), ChartCatalog.canSwap(layout, 5, 'memory')])
                .to.deep.equal([false, false, false]);
        });

        it('shows a count as a rate or so far, unless another tile shows it that way, and a level only one way', () => {
            expect(keys(ChartCatalog.showAs(layout, 1, 'rate'))).to.deep.equal(['cpu', 'tasks-started:rate', 'idle']);
            expect([ChartCatalog.canShowAs(layout, 1, 'total'), ChartCatalog.canShowAs(layout, 0, 'rate')]).to.deep.equal([false, false]);
            const both = ChartCatalog.add(layout, 'tasks-started');
            expect(ChartCatalog.canShowAs(both, 3, 'total')).to.equal(false);
        });

        it('moves a tile to another place, the others shifting over, and removes one', () => {
            expect(keys(ChartCatalog.move(layout, 0, 2))).to.deep.equal(['tasks-started:total', 'idle', 'cpu']);
            expect(keys(ChartCatalog.move(layout, 2, 0))).to.deep.equal(['idle', 'cpu', 'tasks-started:total']);
            expect(keys(ChartCatalog.move(layout, 1, 7))).to.deep.equal(keys(layout));
            expect(keys(ChartCatalog.remove(layout, 1))).to.deep.equal(['cpu', 'idle']);
        });
    });
});
