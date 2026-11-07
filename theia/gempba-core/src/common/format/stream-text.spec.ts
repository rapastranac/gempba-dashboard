import { expect } from 'chai';
import { ClockText } from './clock-text';
import { StreamText } from './stream-text';

const lastFrameAt = new Date(2026, 10, 5, 12, 4, 31).getTime();

describe('StreamText', () => {

    it('shows no bar while live or holding nothing', () => {
        expect(StreamText.bar('live', lastFrameAt, lastFrameAt + 5_000)).to.equal(undefined);
        expect(StreamText.bar(undefined, undefined, 0)).to.equal(undefined);
    });

    it('says a paused run is paused, with the age of its last frame, offering Resume and Snapshot', () => {
        expect(StreamText.bar('paused', lastFrameAt, lastFrameAt + 12_400))
            .to.deep.equal({ tone: 'paused', text: 'Paused · last frame 12 s ago', actions: ['resume', 'snapshot'] });
    });

    it('says a dropped link is reconnecting, offering nothing while the client retries', () => {
        expect(StreamText.bar('reconnecting', lastFrameAt, lastFrameAt + 3_000))
            .to.deep.equal({ tone: 'stale', text: 'Reconnecting… · last frame 3 s ago', actions: [] });
    });

    it('says the run ended and the hub waits for the next, with the time of its last frame, offering Clear', () => {
        expect(StreamText.bar('ended', lastFrameAt, lastFrameAt + 125_000)).to.deep.equal({
            tone: 'ended', text: 'Run ended · last frame 2 min ago (12:04:31) · waiting for the next run', actions: ['clear']
        });
    });

    it('names why frozen data is not live, offering Listen again and Clear, or Connect and Clear once the SSH session is lost', () => {
        const bars = (['stopped', 'disconnected', 'lost'] as const).map(condition => StreamText.bar(condition, lastFrameAt, lastFrameAt + 125_000));
        expect(bars.map(shown => shown?.text)).to.deep.equal([
            'Not live · last frame 2 min ago (12:04:31) · stopped',
            'Not live · last frame 2 min ago (12:04:31) · disconnected',
            'Not live · last frame 2 min ago (12:04:31) · connection lost'
        ]);
        expect(bars.map(shown => [shown?.tone, shown?.actions])).to.deep.equal([
            ['off', ['listen', 'clear']], ['off', ['listen', 'clear']], ['off', ['connect', 'clear']]
        ]);
    });

    it('leaves out the last frame when none arrived, and ticks its age with the clock', () => {
        expect(StreamText.bar('stopped', undefined, 0)?.text).to.equal('Not live · stopped');
        expect(StreamText.bar('paused', lastFrameAt, lastFrameAt + 61_000)?.text).to.equal(`Paused · last frame ${ClockText.ago(61_000)}`);
    });

    it('labels each action', () => {
        expect((['resume', 'snapshot', 'listen', 'connect', 'clear'] as const).map(StreamText.actionLabel))
            .to.deep.equal(['Resume', 'Snapshot', 'Listen again…', 'Connect…', 'Clear']);
    });
});
