import { ConnectionState } from '../config/connection-state';
import { StreamLink } from '../config/stream-link';
import { WorldSnapshot } from '../model/world-snapshot';

/**
 * What the views say about the data they hold: live, paused, or why it is frozen. Frozen data stays as it was until
 * Clear or a new Listen; a new run on a live stream is new data, not frozen data.
 * - `live`: listening with the link up; frames may still be late, which the views' liveness shows.
 * - `paused`: gempba paused its telemetry; the stream stays connected.
 * - `ended`: gempba sent the run's final line; the hub listens for the next run on the same port.
 * - `reconnecting`: the link dropped and the client retries on its own.
 * - `stopped`, `disconnected`: the user stopped listening, or disconnected.
 * - `lost`: the SSH session closed on its own.
 */
export type StreamCondition = 'live' | 'paused' | 'ended' | 'reconnecting' | 'stopped' | 'disconnected' | 'lost';

export namespace StreamCondition {

    export interface Stream {
        readonly state: ConnectionState;
        readonly link: StreamLink | undefined;
        readonly snapshot: WorldSnapshot | undefined;
    }

    /** The condition of the data the hub holds; `undefined` while it holds none. */
    export function of({ state, link, snapshot }: Stream): StreamCondition | undefined {
        if (!snapshot) {
            return undefined;
        }
        if (state === ConnectionState.LISTENING) {
            if (snapshot.final) {
                return 'ended';
            }
            if (link === StreamLink.RETRYING) {
                return 'reconnecting';
            }
            return snapshot.paused ? 'paused' : 'live';
        }
        switch (link) {
            case StreamLink.DISCONNECTED:
                return 'disconnected';
            case StreamLink.SESSION_CLOSED:
                return 'lost';
            default:
                return 'stopped';
        }
    }

    /** Whether the data is frozen: held, with nothing live arriving. Only then can it be cleared. */
    export function isFrozen(condition: StreamCondition | undefined): boolean {
        return condition !== undefined && condition !== 'live' && condition !== 'paused';
    }
}
