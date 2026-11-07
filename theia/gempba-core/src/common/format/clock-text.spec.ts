import { expect } from 'chai';
import { ClockText } from './clock-text';

describe('ClockText', () => {

    it('says how long ago in whole seconds, minutes, hours or days', () => {
        expect([0, 999, 12_400, 59_999].map(ClockText.ago)).to.deep.equal(['0 s ago', '0 s ago', '12 s ago', '59 s ago']);
        expect([60_000, 150_000, 3_599_999].map(ClockText.ago)).to.deep.equal(['1 min ago', '2 min ago', '59 min ago']);
        expect([3_600_000, 86_399_999, 86_400_000, 3 * 86_400_000].map(ClockText.ago)).to.deep.equal(['1 h ago', '23 h ago', '1 d ago', '3 d ago']);
    });

    it('reads a moment ahead of this clock as just now', () => {
        expect(ClockText.ago(-500)).to.equal('0 s ago');
    });

    it('gives the local time of day with two digits each', () => {
        expect(ClockText.time(new Date(2026, 10, 5, 12, 4, 31).getTime())).to.equal('12:04:31');
        expect(ClockText.time(new Date(2026, 10, 5, 7, 0, 9, 800).getTime())).to.equal('07:00:09');
    });
});
