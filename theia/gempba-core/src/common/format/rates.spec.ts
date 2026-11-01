import { expect } from 'chai';
import { Rates } from './rates';

describe('Rates', () => {

    it('counts per second from one a second up, and per minute below, never coarser', () => {
        expect(Rates.text(1234)).to.equal('1,234 tasks/s');
        expect(Rates.text(42)).to.equal('42 tasks/s');
        expect(Rates.text(3.5)).to.equal('3.5 tasks/s');
        expect(Rates.text(1)).to.equal('1.0 tasks/s');
        expect(Rates.text(0.5)).to.equal('30 tasks/min');
        expect(Rates.text(0.05)).to.equal('3.0 tasks/min');
        expect(Rates.text(1 / 3600)).to.equal('0.02 tasks/min');
        expect(Rates.text(0)).to.equal('0 tasks/min');
    });

    it('shows nothing before there is a rate', () => {
        expect(Rates.text(undefined)).to.equal('—');
        expect(Rates.text(Number.NaN)).to.equal('—');
        expect(Rates.of(undefined)).to.deep.equal({ value: '—' });
    });

    it('keeps a unit it is given, so a chart reads its whole history in one', () => {
        expect(Rates.of(0.5, '/s')).to.deep.equal({ value: '0.50', unit: '/s' });
        expect(Rates.of(2, '/min')).to.deep.equal({ value: '120', unit: '/min' });
        expect(Rates.text(12, 'frames', '/min')).to.equal('720 frames/min');
        expect([Rates.unitFor(0.99), Rates.unitFor(1)]).to.deep.equal(['/min', '/s']);
        expect(Rates.inUnit(0.25, '/min')).to.equal(15);
    });

    it('adds the run average to a total once time has elapsed', () => {
        expect(Rates.countWithRate(12_450, 0)).to.equal('12,450');
        expect(Rates.countWithRate(7, -1)).to.equal('7');
        expect(Rates.countWithRate(0, 100)).to.equal('0');
        expect(Rates.countWithRate(1000, 100)).to.equal('1,000 · 10 tasks/s on average');
        expect(Rates.countWithRate(3, 600)).to.equal('3 · 0.30 tasks/min on average');
    });
});
