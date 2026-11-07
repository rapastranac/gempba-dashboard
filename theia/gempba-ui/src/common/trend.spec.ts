import { expect } from 'chai';
import { Trend } from './trend';

describe('Trend', () => {

    it('is flat without two windows of samples', () => {
        expect(Trend.of([1, 2, 3, 4, 5, 6, 7, 8, 9])).to.deep.equal({ direction: 'flat' });
    });

    it('compares the latest five samples with the five before', () => {
        expect(Trend.of([100, 100, 100, 100, 100, 120, 120, 120, 120, 120])).to.deep.equal({ direction: 'up', change: 0.2 });
        expect(Trend.of([9, 9, 100, 100, 100, 100, 100, 50, 50, 50, 50, 50])).to.deep.equal({ direction: 'down', change: -0.5 });
    });

    it('a change within five percent is flat', () => {
        expect(Trend.of([100, 100, 100, 100, 100, 104, 104, 104, 104, 104]).direction).to.equal('flat');
    });

    it('rising from zero is up, staying at zero is flat', () => {
        expect(Trend.of([0, 0, 0, 0, 0, 1, 1, 1, 1, 1])).to.deep.equal({ direction: 'up' });
        expect(Trend.of(new Array(10).fill(0))).to.deep.equal({ direction: 'flat' });
    });
});
