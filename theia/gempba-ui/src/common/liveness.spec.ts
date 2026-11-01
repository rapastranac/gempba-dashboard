import { expect } from 'chai';
import { Liveness } from './liveness';

describe('Liveness', () => {

    const stream = { streaming: true, lastFrameAt: 10_000, now: 10_000, intervalMs: 500 };

    it('is off without a stream', () => {
        expect(Liveness.of({ ...stream, streaming: false })).to.equal('off');
    });

    it('is live while frames arrive', () => {
        expect(Liveness.of({ ...stream, now: 11_900 })).to.equal('live');
    });

    it('is stale once frames are later than three intervals, and never sooner than two seconds', () => {
        expect(Liveness.of({ ...stream, now: 12_001 })).to.equal('stale');
        expect(Liveness.of({ ...stream, intervalMs: 2000, now: 15_999 })).to.equal('live');
        expect(Liveness.of({ ...stream, intervalMs: 2000, now: 16_001 })).to.equal('stale');
        expect(Liveness.of({ ...stream, intervalMs: 50, now: 11_000 })).to.equal('live');
    });

    it('is stale while a new stream waits for its first frame', () => {
        expect(Liveness.of({ ...stream, lastFrameAt: undefined })).to.equal('stale');
    });

    it('says each state in words', () => {
        expect((['live', 'stale', 'off'] as const).map(Liveness.label)).to.deep.equal(['Live', 'Waiting for frames', 'Not streaming']);
    });
});
