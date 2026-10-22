import { expect } from 'chai';
import { RefreshGate } from './refresh-gate';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('RefreshGate', () => {

    it('refreshes at once while visible', async () => {
        let runs = 0;
        new RefreshGate(() => true, () => void runs++).request();
        await settle();
        expect(runs).to.equal(1);
    });

    it('does nothing while hidden, then catches up once when shown', async () => {
        let visible = false;
        let runs = 0;
        const gate = new RefreshGate(() => visible, () => void runs++);
        gate.request();
        gate.request();
        gate.request();
        await settle();
        expect(runs).to.equal(0);

        visible = true;
        gate.shown();
        await settle();
        expect(runs).to.equal(1);
        gate.shown();
        await settle();
        expect(runs).to.equal(1);
    });

    it('folds requests made during a refresh into one more run', async () => {
        let runs = 0;
        let finish: () => void = () => undefined;
        const gate = new RefreshGate(() => true, () => {
            runs++;
            return new Promise<void>(resolve => finish = resolve);
        });
        gate.request();
        await settle();
        gate.request();
        gate.request();
        expect(runs).to.equal(1);
        finish();
        await settle();
        expect(runs).to.equal(2);
        finish();
        await settle();
        expect(runs).to.equal(2);
    });

    it('a failing refresh does not stop later ones', async () => {
        let runs = 0;
        const gate = new RefreshGate(() => true, () => {
            runs++;
            throw new Error('boom');
        });
        gate.request();
        await settle();
        gate.request();
        await settle();
        expect(runs).to.equal(2);
    });
});
