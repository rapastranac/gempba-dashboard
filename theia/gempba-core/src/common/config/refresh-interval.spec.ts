import { expect } from 'chai';
import { RefreshInterval } from './refresh-interval';

describe('RefreshInterval', () => {

    it('offers presets within gempba\'s bounds, including both defaults', () => {
        expect(RefreshInterval.PRESETS_MS.every(ms => ms >= RefreshInterval.MIN_MS && ms <= RefreshInterval.MAX_MS)).to.be.true;
        expect(RefreshInterval.PRESETS_MS).to.include.members([RefreshInterval.DEFAULT_WORKER_MS, RefreshInterval.DEFAULT_NODE_MS]);
        expect([...RefreshInterval.PRESETS_MS].sort((a, b) => a - b)).to.deep.equal(RefreshInterval.PRESETS_MS);
    });

    it('clamps to whole milliseconds between the bounds', () => {
        expect(RefreshInterval.clamp(250)).to.equal(250);
        expect(RefreshInterval.clamp(250.6)).to.equal(251);
        expect(RefreshInterval.clamp(10)).to.equal(RefreshInterval.MIN_MS);
        expect(RefreshInterval.clamp(-1)).to.equal(RefreshInterval.MIN_MS);
        expect(RefreshInterval.clamp(10_000_000)).to.equal(RefreshInterval.MAX_MS);
    });

    it('parses a typed whole number between the bounds', () => {
        expect(RefreshInterval.parse('750')).to.equal(750);
        expect(RefreshInterval.parse(' 50 ')).to.equal(50);
        expect(RefreshInterval.parse('600000')).to.equal(600_000);
    });

    it('rejects typed text that is not a whole number between the bounds', () => {
        for (const text of ['', ' ', 'fast', '49', '600001', '2.5', '-500', '1e3x']) {
            expect(RefreshInterval.parse(text), `'${text}'`).to.equal(undefined);
        }
    });

    it('labels milliseconds, seconds and whole minutes', () => {
        expect(RefreshInterval.PRESETS_MS.map(RefreshInterval.label)).to.deep.equal(['100 ms', '250 ms', '500 ms', '1 s', '2 s', '5 s']);
        expect(RefreshInterval.label(2500)).to.equal('2.5 s');
        expect(RefreshInterval.label(90_000)).to.equal('90 s');
        expect(RefreshInterval.label(600_000)).to.equal('10 min');
    });
});
