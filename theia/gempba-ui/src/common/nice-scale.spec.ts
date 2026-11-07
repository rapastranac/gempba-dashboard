import { expect } from 'chai';
import { NiceScale } from './nice-scale';

describe('NiceScale', () => {

    it('rounds up to 1, 2, 2.5 or 5 times a power of ten', () => {
        expect([0.3, 1, 1.2, 2, 2.2, 2.5, 3, 7, 10, 11, 237, 1_800, 4_999].map(NiceScale.niceAbove))
            .to.deep.equal([0.5, 1, 2, 2, 2.5, 2.5, 5, 10, 10, 20, 250, 2_000, 5_000]);
    });

    it('tops the largest value', () => {
        expect(NiceScale.max([12, 237, 80])).to.equal(250);
    });

    it('keeps a floor, such as 100 for a percentage', () => {
        expect(NiceScale.max([12, 30], 100)).to.equal(100);
        expect(NiceScale.max([12, 130], 100)).to.equal(200);
    });

    it('is 1 with nothing above zero, so a scale never collapses', () => {
        expect([NiceScale.max([]), NiceScale.max([0, 0]), NiceScale.max([-5])]).to.deep.equal([1, 1, 1]);
    });

    it('ignores values that are not numbers', () => {
        expect(NiceScale.max([Number.NaN, 40, Infinity])).to.equal(50);
    });
});
