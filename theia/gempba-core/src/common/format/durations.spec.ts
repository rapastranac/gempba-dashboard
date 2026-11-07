import { expect } from 'chai';
import { Durations } from './durations';

const US = 1_000_000;

describe('Durations', () => {

    it('microseconds below one millisecond', () => {
        expect(Durations.format(0)).to.equal('0 µs');
        expect(Durations.format(1)).to.equal('1 µs');
        expect(Durations.format(999)).to.equal('999 µs');
    });

    it('milliseconds below one second', () => {
        expect(Durations.format(1_000)).to.equal('1.0 ms');
        expect(Durations.format(238_293)).to.equal('238.3 ms');
        expect(Durations.format(999_999)).to.equal('1000.0 ms');
    });

    it('seconds below one minute keep one decimal', () => {
        expect(Durations.format(1_000_000)).to.equal('1.0 s');
        expect(Durations.format(4_500_000)).to.equal('4.5 s');
        expect(Durations.format(59_900_000)).to.equal('59.9 s');
    });

    it('minutes use minutes and seconds', () => {
        expect(Durations.format(60 * US)).to.equal('1 m 0 s');
        expect(Durations.format(75 * US)).to.equal('1 m 15 s');
        expect(Durations.format(330 * US)).to.equal('5 m 30 s');
    });

    it('hours use hours, minutes and seconds', () => {
        expect(Durations.format(3_600 * US)).to.equal('1 h 0 m 0 s');
        expect(Durations.format((3_600 + 23 * 60 + 45) * US)).to.equal('1 h 23 m 45 s');
        expect(Durations.format((23 * 3_600 + 59 * 60 + 59) * US)).to.equal('23 h 59 m 59 s');
    });

    it('days drop seconds and show d h m', () => {
        expect(Durations.format(86_400 * US)).to.equal('1 d 0 h 0 m');
        expect(Durations.format((2 * 86_400 + 4 * 3_600 + 30 * 60 + 17) * US)).to.equal('2 d 4 h 30 m');
    });

    it('negative input renders a dash', () => {
        expect(Durations.format(-1)).to.equal('—');
    });

    it('formatSeconds renders whole seconds below one minute', () => {
        expect(Durations.formatSeconds(0)).to.equal('0 s');
        expect(Durations.formatSeconds(1)).to.equal('1 s');
        expect(Durations.formatSeconds(45)).to.equal('45 s');
        expect(Durations.formatSeconds(59)).to.equal('59 s');
    });

    it('formatSeconds from one minute uses the microsecond layout', () => {
        expect(Durations.formatSeconds(60)).to.equal('1 m 0 s');
        expect(Durations.formatSeconds(330)).to.equal('5 m 30 s');
        expect(Durations.formatSeconds(3_600 + 23 * 60 + 45)).to.equal('1 h 23 m 45 s');
    });

    it('formatSeconds of a negative value renders a dash', () => {
        expect(Durations.formatSeconds(-1)).to.equal('—');
    });
});
