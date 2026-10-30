import { expect } from 'chai';
import { HeatScale } from './heat-scale';

describe('HeatScale', () => {

    it('has a step per tenth of a CPU, from idle to fully busy', () => {
        expect([0, 4, 5, 26, 50, 94, 95, 100].map(HeatScale.step)).to.deep.equal([0, 0, 1, 3, 5, 9, 10, 10]);
    });

    it('keeps an oversubscribed CPU at the busiest step', () => {
        expect(HeatScale.step(150)).to.equal(HeatScale.STEPS);
    });

    it('treats a load that is not a number, or below zero, as idle', () => {
        expect([Number.NaN, -10, -Infinity].map(HeatScale.step)).to.deep.equal([0, 0, 0]);
    });

    it('mixes in a tenth more of the high color per step', () => {
        expect([0, 3, 10].map(HeatScale.mix)).to.deep.equal(['0%', '30%', '100%']);
        expect([-1, 12].map(HeatScale.mix)).to.deep.equal(['0%', '100%']);
    });
});
