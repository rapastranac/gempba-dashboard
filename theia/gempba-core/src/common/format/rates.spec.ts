import { expect } from 'chai';
import { Rates } from './rates';

describe('Rates', () => {

    it('no elapsed time shows the total only', () => {
        expect(Rates.countWithRate(12_450, 0)).to.equal('12,450 total');
        expect(Rates.countWithRate(7, -1)).to.equal('7 total');
    });

    it('with elapsed time appends the average rate', () => {
        expect(Rates.countWithRate(1000, 100)).to.equal('1,000 total · (10 / sec)');
    });

    it('per second uses adaptive precision', () => {
        expect(Rates.perSecond(Number.NaN)).to.equal('— / sec');
        expect(Rates.perSecond(0)).to.equal('0 / sec');
        expect(Rates.perSecond(0.42)).to.equal('0.42 / sec');
        expect(Rates.perSecond(3.5)).to.equal('3.5 / sec');
        expect(Rates.perSecond(42)).to.equal('42 / sec');
        expect(Rates.perSecond(1234)).to.equal('1,234 / sec');
    });
});
