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

    it('is paused while gempba sends its paused lines, though no frames arrive, and stale once those stop too', () => {
        const paused = { ...stream, paused: true, lastFrameAt: 1_000, lastLineAt: 10_000 };
        expect(Liveness.of({ ...paused, now: 11_900 })).to.equal('paused');
        expect(Liveness.of({ ...paused, now: 12_001 })).to.equal('stale');
        expect(Liveness.of({ ...paused, lastLineAt: undefined })).to.equal('stale');
    });

    it('says the run ended after its final line, however long ago, until the stream stops', () => {
        const ended = { ...stream, ended: true, paused: true, now: 600_000 };
        expect(Liveness.of(ended)).to.equal('ended');
        expect(Liveness.of({ ...ended, streaming: false })).to.equal('off');
    });

    it('says each state in words', () => {
        expect((['live', 'paused', 'ended', 'stale', 'off'] as const).map(Liveness.label))
            .to.deep.equal(['Live', 'Paused', 'Run ended', 'Waiting for frames', 'Not streaming']);
    });
});
