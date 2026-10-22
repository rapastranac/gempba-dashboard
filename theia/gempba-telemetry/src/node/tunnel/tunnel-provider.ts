import { ConnectionMode, SessionSpec, TargetSpec } from '@gempba/core';

/**
 * Contribution point for reaching a gempba center in one {@link ConnectionMode}. Telemetry provides LOCAL;
 * another extension contributes HOST and JUMP. Telemetry only ever dials the local port a forward hands it.
 * Bind providers in a ConnectionContainerModule: they are per window, so they can prompt that window's user.
 */
export const TunnelProvider = Symbol('TunnelProvider');

export interface TunnelProvider {
    readonly mode: ConnectionMode;
    /** Opens the session, authenticating once. */
    open(session: SessionSpec): Promise<Tunnel>;
}

/** An open session; forwarding to another target never re-authenticates. */
export interface Tunnel {
    forward(target: TargetSpec): Promise<Forward>;
    close(): void;
}

/** A loopback port that reaches the target's gempba center. */
export interface Forward {
    readonly port: number;
    close(): void;
}
