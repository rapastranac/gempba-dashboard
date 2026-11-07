import { Config } from './config';
import { ConnectionMode } from './connection-mode';
import { RefreshInterval } from './refresh-interval';
import { SessionSpec } from './session-spec';
import { positiveOr } from './values';

/**
 * The persisted UI state, restored on launch so the connection bar comes back pre-filled.
 * One block per mode, so switching modes restores the fields last used for that mode.
 */
export interface DashboardSettings {
    readonly lastMode: ConnectionMode;
    readonly local: DashboardSettings.LocalSettings;
    readonly host: DashboardSettings.HostSettings;
    readonly jump: DashboardSettings.JumpSettings;
    readonly workerIntervalMs: number;
    readonly nodeIntervalMs: number;
}

export namespace DashboardSettings {

    export interface LocalSettings {
        readonly gempbaPort: number;
        readonly recentPorts: readonly number[];
    }

    export interface HostSettings {
        readonly host: string;
        readonly sshPort: number;
        readonly sshKey: string;
        readonly gempbaPort: number;
        readonly recentPorts: readonly number[];
    }

    export interface JumpSettings {
        readonly loginHost: string;
        readonly sshPort: number;
        readonly sshKey: string;
        readonly targetHost: string;
        readonly gempbaPort: number;
        readonly recentTargets: readonly string[];
        readonly recentLoginHosts: readonly string[];
    }

    export interface Input {
        readonly lastMode?: ConnectionMode;
        readonly local?: Partial<LocalSettings>;
        readonly host?: Partial<HostSettings>;
        readonly jump?: Partial<JumpSettings>;
        readonly workerIntervalMs?: number;
        readonly nodeIntervalMs?: number;
    }

    export function of(settings: Input): DashboardSettings {
        return {
            lastMode: settings.lastMode ?? ConnectionMode.LOCAL,
            local: localOf(settings.local ?? {}),
            host: hostOf(settings.host ?? {}),
            jump: jumpOf(settings.jump ?? {}),
            workerIntervalMs: positiveOr(settings.workerIntervalMs, RefreshInterval.DEFAULT_MS),
            nodeIntervalMs: positiveOr(settings.nodeIntervalMs, RefreshInterval.DEFAULT_NODE_MS)
        };
    }

    export function defaults(): DashboardSettings {
        return of({});
    }

    export function localOf(local: Partial<LocalSettings>): LocalSettings {
        return {
            gempbaPort: positiveOr(local.gempbaPort, Config.DEFAULT_PORT),
            recentPorts: [...local.recentPorts ?? []]
        };
    }

    export function hostOf(host: Partial<HostSettings>): HostSettings {
        return {
            host: host.host ?? '',
            sshPort: positiveOr(host.sshPort, SessionSpec.DEFAULT_SSH_PORT),
            sshKey: host.sshKey ?? '',
            gempbaPort: positiveOr(host.gempbaPort, Config.DEFAULT_PORT),
            recentPorts: [...host.recentPorts ?? []]
        };
    }

    export function jumpOf(jump: Partial<JumpSettings>): JumpSettings {
        return {
            loginHost: jump.loginHost ?? '',
            sshPort: positiveOr(jump.sshPort, SessionSpec.DEFAULT_SSH_PORT),
            sshKey: jump.sshKey ?? '',
            targetHost: jump.targetHost ?? '',
            gempbaPort: positiveOr(jump.gempbaPort, Config.DEFAULT_PORT),
            recentTargets: [...jump.recentTargets ?? []],
            recentLoginHosts: [...jump.recentLoginHosts ?? []]
        };
    }
}
