import { BroadcastEnvelope } from '../protocol/wire-protocol';

/** Callbacks of a {@link TelemetryClient}; none fire after the client is closed. */
export interface FrameListener {

    /** Once per established TCP connection, before any of its frames. */
    onConnected(): void;

    /** For every line that parses as a broadcast envelope. */
    onFrame(frame: BroadcastEnvelope): void;

    /** The connection dropped: `cause` is undefined for a clean close by the peer, else the socket error. */
    onDisconnected(cause: Error | undefined): void;
}
