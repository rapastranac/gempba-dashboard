import { expect } from 'chai';
import { MotionTiming } from './motion-timing';

describe('MotionTiming', () => {

    it('takes most of a frame interval, up to 400 ms', () => {
        expect([100, 250, 500, 1000, 5000].map(ms => MotionTiming.durationMs(ms))).to.deep.equal([80, 200, 400, 400, 400]);
    });

    it('animates nothing at the fastest rates, where it would read as jitter', () => {
        expect([50, 99].map(ms => MotionTiming.durationMs(ms))).to.deep.equal([0, 0]);
    });

    it('animates nothing when the user asked for less motion', () => {
        expect(MotionTiming.durationMs(500, true)).to.equal(0);
    });

    it('animates nothing for an interval that is unknown', () => {
        expect([0, -1, Number.NaN].map(ms => MotionTiming.durationMs(ms))).to.deep.equal([0, 0, 0]);
    });
});
