import { expect } from 'chai';
import { RefreshGate } from './refresh-gate';

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

    it('with a minimum interval, redraws at most that often, then once more with the latest state', async () => {
        let runs = 0;
        const gate = new RefreshGate(() => true, () => void runs++, 200);
        gate.request();
        await settle();
        for (let i = 0; i < 5; i++) {
            gate.request();
        }
        await settle();
        expect(runs).to.equal(1);
        await sleep(250);
        expect(runs).to.equal(2);
        await sleep(250);
        expect(runs).to.equal(2);
    });

    it('a request after the minimum interval redraws at once', async () => {
        let at = 0;
        let runs = 0;
        const gate = new RefreshGate(() => true, () => void runs++, 100, () => at);
        gate.request();
        await settle();
        at = 150;
        gate.request();
        await settle();
        expect(runs).to.equal(2);
    });

    it('dispose drops a redraw waiting for its interval', async () => {
        let runs = 0;
        const gate = new RefreshGate(() => true, () => void runs++, 100);
        gate.request();
        await settle();
        gate.request();
        gate.dispose();
        await sleep(150);
        expect(runs).to.equal(1);
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
