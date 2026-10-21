/** The connection lifecycle as the UI sees it. CONNECTED is authenticated but not yet streaming a target. */
export enum ConnectionState {
    DISCONNECTED = 'DISCONNECTED',
    CONNECTING = 'CONNECTING',
    CONNECTED = 'CONNECTED',
    LISTENING = 'LISTENING'
}
