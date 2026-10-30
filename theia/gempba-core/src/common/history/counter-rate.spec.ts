import { expect } from 'chai';
import { CounterRate } from './counter-rate';

describe('CounterRate', () => {

    it('is the rise per second between two readings', () => {
        expect(CounterRate.perSecond(100, 150, 500)).to.equal(100);
        expect(CounterRate.perSecond(0, 3, 2000)).to.equal(1.5);
    });

    it('a counter that did not move is zero', () => {
        expect(CounterRate.perSecond(42, 42, 500)).to.equal(0);
    });

    it('a counter that went back, as after a restart, gives no value', () => {
        expect(CounterRate.perSecond(1000, 10, 500)).to.equal(undefined);
    });

    it('a repeated frame, with no time between the readings, gives no value', () => {
        expect(CounterRate.perSecond(100, 100, 0)).to.equal(undefined);
        expect(CounterRate.perSecond(100, 150, 0)).to.equal(undefined);
    });

    it('a clock that went back gives no value', () => {
        expect(CounterRate.perSecond(100, 150, -500)).to.equal(undefined);
    });
});
