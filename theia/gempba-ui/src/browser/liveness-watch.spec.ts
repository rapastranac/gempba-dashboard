import { expect } from 'chai';
import { LivenessWatch } from './liveness-watch';

const CHECK_MS = 5;

function settle(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, CHECK_MS * 6));
}

describe('LivenessWatch', () => {

    let state: string;
    let view: { isVisible: boolean };
    let redraws: number;
    let watch: LivenessWatch<string>;

    beforeEach(() => {
        state = 'live';
        view = { isVisible: true };
        redraws = 0;
        watch = new LivenessWatch(view, () => state, () => {
            redraws++;
            watch.drawn(state);
        }, CHECK_MS);
    });

    afterEach(() => watch.dispose());

    it('redraws once when what the view drew no longer holds', async () => {
        expect(watch.drawn(state)).to.equal('live');
        state = 'stale';
        await settle();
        expect(redraws).to.equal(1);
    });

    it('leaves the view alone while its liveness holds', async () => {
        watch.drawn(state);
        await settle();
        expect(redraws).to.equal(0);
    });

    it('waits while the view is hidden or shows no liveness', async () => {
        watch.drawn(state);
        view.isVisible = false;
        state = 'stale';
        await settle();
        view.isVisible = true;
        watch.none();
        await settle();
        expect(redraws).to.equal(0);
    });

    it('stops checking once disposed', async () => {
        watch.drawn(state);
        watch.dispose();
        state = 'stale';
        await settle();
        expect(redraws).to.equal(0);
    });
});
