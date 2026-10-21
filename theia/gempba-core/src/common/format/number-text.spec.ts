import { expect } from 'chai';
import { NumberText } from './number-text';

describe('NumberText', () => {

    it('rounds the shortest decimal half-up like Java, not like toFixed', () => {
        expect(NumberText.fixed(1.005, 2)).to.equal('1.01');
        expect(NumberText.fixed(0.125, 2)).to.equal('0.13');
        expect(NumberText.fixed(2.5, 0)).to.equal('3');
        expect(NumberText.fixed(999.999, 1)).to.equal('1000.0');
    });

    it('keeps the sign of negative values', () => {
        expect(NumberText.fixed(-1.25, 1)).to.equal('-1.3');
    });

    it('groups thousands with commas independent of the locale', () => {
        expect(NumberText.grouped(0)).to.equal('0');
        expect(NumberText.grouped(999)).to.equal('999');
        expect(NumberText.grouped(12_450)).to.equal('12,450');
        expect(NumberText.grouped(1_234_567)).to.equal('1,234,567');
        expect(NumberText.grouped(-1_234)).to.equal('-1,234');
    });
});
