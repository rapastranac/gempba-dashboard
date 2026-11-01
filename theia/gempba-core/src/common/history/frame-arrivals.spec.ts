import { expect } from 'chai';
import { FrameArrivals } from './frame-arrivals';

describe('FrameArrivals', () => {

    it('knows no time before a group sent a frame', () => {
        expect(new FrameArrivals().lastAt('alpha')).to.equal(undefined);
    });

    it('moves a group\'s time when one of its senders sends a new frame', () => {
        const arrivals = new FrameArrivals();
        arrivals.record('alpha', '3', 17, 1000);
        arrivals.record('alpha', '4', 9, 1200);
        arrivals.record('alpha', '3', 18, 1500);
        expect(arrivals.lastAt('alpha')).to.equal(1500);
    });

    it('keeps a group\'s time while its senders\' frames only repeat', () => {
        const arrivals = new FrameArrivals();
        arrivals.record('alpha', '3', 17, 1000);
        arrivals.record('beta', '5', 2, 1000);
        arrivals.record('alpha', '3', 17, 1500);
        arrivals.record('beta', '5', 3, 1500);
        expect(arrivals.lastAt('alpha')).to.equal(1000);
        expect(arrivals.lastAt('beta')).to.equal(1500);
    });

    it('takes a restarted sender\'s first frame as new', () => {
        const arrivals = new FrameArrivals();
        arrivals.record('alpha', '3', 17, 1000);
        arrivals.record('alpha', '3', 1, 2000);
        expect(arrivals.lastAt('alpha')).to.equal(2000);
    });

    it('clear forgets every time and frame', () => {
        const arrivals = new FrameArrivals();
        arrivals.record('alpha', '3', 17, 1000);
        arrivals.clear();
        expect(arrivals.lastAt('alpha')).to.equal(undefined);
        arrivals.record('alpha', '3', 17, 3000);
        expect(arrivals.lastAt('alpha')).to.equal(3000);
    });
});
