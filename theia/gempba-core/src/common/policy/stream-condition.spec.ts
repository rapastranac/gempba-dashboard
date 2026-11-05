import { expect } from 'chai';
import { ConnectionState } from '../config/connection-state';
import { StreamLink } from '../config/stream-link';
import { WorldSnapshot } from '../model/world-snapshot';
import { StreamCondition } from './stream-condition';

const data: WorldSnapshot = { ...WorldSnapshot.empty(), timestampMillis: 1 };
const of = (state: ConnectionState, link: StreamLink | undefined, snapshot: WorldSnapshot | undefined = data) => StreamCondition.of({ state, link, snapshot });

describe('StreamCondition', () => {

    it('has none while no data is held, whatever the stream does', () => {
        expect(StreamCondition.of({ state: ConnectionState.LISTENING, link: StreamLink.UP, snapshot: undefined })).to.equal(undefined);
        expect(StreamCondition.of({ state: ConnectionState.DISCONNECTED, link: StreamLink.STOPPED, snapshot: undefined })).to.equal(undefined);
    });

    it('is live while listening with the link up, and paused while gempba pauses its telemetry', () => {
        expect(of(ConnectionState.LISTENING, StreamLink.UP)).to.equal('live');
        expect(of(ConnectionState.LISTENING, StreamLink.UP, { ...data, paused: true })).to.equal('paused');
    });

    it('reads a dropped link the client retries as reconnecting, and the run\'s final line as ended, even once the link drops', () => {
        expect(of(ConnectionState.LISTENING, StreamLink.RETRYING)).to.equal('reconnecting');
        expect(of(ConnectionState.LISTENING, StreamLink.RETRYING, { ...data, paused: true })).to.equal('reconnecting');
        expect(of(ConnectionState.LISTENING, StreamLink.UP, { ...data, final: true })).to.equal('ended');
        expect(of(ConnectionState.LISTENING, StreamLink.RETRYING, { ...data, final: true })).to.equal('ended');
    });

    it('names why a stream that is no longer listening stopped', () => {
        expect(of(ConnectionState.DISCONNECTED, StreamLink.STOPPED)).to.equal('stopped');
        expect(of(ConnectionState.CONNECTED, StreamLink.STOPPED)).to.equal('stopped');
        expect(of(ConnectionState.DISCONNECTED, StreamLink.DISCONNECTED)).to.equal('disconnected');
        expect(of(ConnectionState.DISCONNECTED, StreamLink.SESSION_CLOSED)).to.equal('lost');
        expect(of(ConnectionState.CONNECTING, StreamLink.STOPPED, { ...data, final: true })).to.equal('stopped');
    });

    it('counts every condition but live and paused as frozen data', () => {
        const frozen = (['live', 'paused', 'ended', 'reconnecting', 'stopped', 'disconnected', 'lost'] as const).filter(StreamCondition.isFrozen);
        expect(frozen).to.deep.equal(['ended', 'reconnecting', 'stopped', 'disconnected', 'lost']);
        expect(StreamCondition.isFrozen(undefined)).to.equal(false);
    });
});
