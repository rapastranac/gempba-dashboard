import { expect } from 'chai';
import { FrameCadence } from './frame-cadence';

/** Records one sender's frames, numbered from 1, at the given times on its clock. */
function framesAt(cadence: FrameCadence, sender: string, ...millis: number[]): FrameCadence {
    millis.forEach((at, index) => cadence.record(sender, index + 1, at));
    return cadence;
}

describe('FrameCadence', () => {

    it('is unknown before a sender sent two frames', () => {
        const cadence = new FrameCadence();
        expect(cadence.medianMs()).to.equal(undefined);
        cadence.record('w1', 1, 1_000);
        cadence.record('w2', 1, 1_200);
        expect(cadence.medianMs()).to.equal(undefined);
    });

    it('is the interval between a sender\'s frames', () => {
        expect(framesAt(new FrameCadence(), 'w1', 1_000, 1_500, 2_000).medianMs()).to.equal(500);
    });

    it('a repeated frame adds no interval', () => {
        const cadence = new FrameCadence();
        cadence.record('w1', 1, 0);
        cadence.record('w1', 1, 0);
        cadence.record('w1', 2, 250);
        cadence.record('w1', 2, 250);
        cadence.record('w1', 3, 500);
        expect(cadence.medianMs()).to.equal(250);
    });

    it('measures each sender on its own clock', () => {
        const cadence = new FrameCadence();
        framesAt(cadence, 'w1', 0, 1_000, 2_000);
        framesAt(cadence, 'w2', 70_000, 71_000, 72_000);
        expect(cadence.medianMs()).to.equal(1_000);
    });

    it('a dropped frame does not move the median', () => {
        expect(framesAt(new FrameCadence(), 'w1', 0, 500, 1_000, 2_000, 2_500, 3_000).medianMs()).to.equal(500);
    });

    it('a clock that went back starts the sender over', () => {
        const cadence = framesAt(new FrameCadence(), 'w1', 50_000, 50_500);
        cadence.record('w1', 1, 100);
        cadence.record('w1', 2, 600);
        expect(cadence.medianMs()).to.equal(500);
    });

    it('follows a rate change once the latest intervals hold the new one', () => {
        const cadence = new FrameCadence();
        const times = [...Array.from({ length: 10 }, (_, i) => i * 500), ...Array.from({ length: FrameCadence.SAMPLES }, (_, i) => 5_000 + i * 250)];
        expect(framesAt(cadence, 'w1', ...times).medianMs()).to.equal(250);
    });

    it('takes the mean of the two middle intervals of an even count', () => {
        expect(framesAt(new FrameCadence(), 'w1', 0, 200, 500).medianMs()).to.equal(250);
    });

    it('clear forgets every sender and interval', () => {
        const cadence = framesAt(new FrameCadence(), 'w1', 0, 500);
        cadence.clear();
        cadence.record('w1', 3, 10_000);
        expect(cadence.medianMs()).to.equal(undefined);
    });
});
