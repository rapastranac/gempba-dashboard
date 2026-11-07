/** What a stream's link to gempba's telemetry did last, as the backend reports it beside the connection state. */
export enum StreamLink {
    /** The client reached gempba's telemetry: lines arrive. */
    UP = 'UP',
    /** The connection closed and the client retries on its own, as it does until a run listens on the port. */
    RETRYING = 'RETRYING',
    /** The user stopped listening. */
    STOPPED = 'STOPPED',
    /** The user disconnected. */
    DISCONNECTED = 'DISCONNECTED',
    /** The SSH session closed on its own, a lost network or the server ending it; nothing streams until the user connects again. */
    SESSION_CLOSED = 'SESSION_CLOSED'
}
