import { ConnectionMode } from './connection-mode';
import { positiveOr } from './values';

/**
 * The connection identity: everything needed to authenticate once, nothing about which job is
 * observed (that is {@link TargetSpec}), so re-pointing at another job never re-authenticates.
 */
export interface SessionSpec {
    readonly mode: ConnectionMode;
    /** `user@host` of the VM (HOST) or login node (JUMP); blank for LOCAL. */
    readonly host: string;
    readonly sshPort: number;
    /** Identity file; blank relies on the default keys. */
    readonly sshKey: string;
    readonly authMethod: SessionSpec.AuthMethod;
}

export namespace SessionSpec {

    export const DEFAULT_SSH_PORT = 22;

    /** Only SSH_KEY (publickey + keyboard-interactive) is wired; PASSWORD is reserved. */
    export enum AuthMethod {
        SSH_KEY = 'SSH_KEY',
        PASSWORD = 'PASSWORD'
    }

    export function of(spec: Partial<SessionSpec>): SessionSpec {
        return {
            mode: spec.mode ?? ConnectionMode.LOCAL,
            host: spec.host ?? '',
            sshPort: positiveOr(spec.sshPort, DEFAULT_SSH_PORT),
            sshKey: spec.sshKey ?? '',
            authMethod: spec.authMethod ?? AuthMethod.SSH_KEY
        };
    }

    export function local(): SessionSpec {
        return of({ mode: ConnectionMode.LOCAL });
    }

    export function requiresSsh(spec: SessionSpec): boolean {
        return spec.mode !== ConnectionMode.LOCAL;
    }

    export function equals(a: SessionSpec, b: SessionSpec): boolean {
        return a.mode === b.mode && a.host === b.host && a.sshPort === b.sshPort
            && a.sshKey === b.sshKey && a.authMethod === b.authMethod;
    }
}
