import { expect } from 'chai';
import { RefreshInterval } from './refresh-interval';
import { RefreshRates } from './refresh-rates';

describe('RefreshRates', () => {

    it('defaults to gempba\'s own defaults', () => {
        expect(RefreshRates.defaults()).to.deep.equal({ workerIntervalMs: 500, nodeIntervalMs: 1000 });
    });

    it('keeps usable rates', () => {
        expect(RefreshRates.of({ workerIntervalMs: 250, nodeIntervalMs: 2000 })).to.deep.equal({ workerIntervalMs: 250, nodeIntervalMs: 2000 });
    });

    it('clamps numbers to gempba\'s bounds', () => {
        expect(RefreshRates.of({ workerIntervalMs: 1, nodeIntervalMs: 1e9 }))
            .to.deep.equal({ workerIntervalMs: RefreshInterval.MIN_MS, nodeIntervalMs: RefreshInterval.MAX_MS });
    });

    it('a missing or unusable value takes its default', () => {
        expect(RefreshRates.of({})).to.deep.equal(RefreshRates.defaults());
        expect(RefreshRates.of({ workerIntervalMs: '250', nodeIntervalMs: Number.NaN })).to.deep.equal(RefreshRates.defaults());
        expect(RefreshRates.of({ workerIntervalMs: null, nodeIntervalMs: Infinity })).to.deep.equal(RefreshRates.defaults());
    });

    it('equal rates compare equal', () => {
        expect(RefreshRates.equals(RefreshRates.defaults(), RefreshRates.of({}))).to.be.true;
        expect(RefreshRates.equals(RefreshRates.defaults(), RefreshRates.of({ workerIntervalMs: 250 }))).to.be.false;
    });
});
