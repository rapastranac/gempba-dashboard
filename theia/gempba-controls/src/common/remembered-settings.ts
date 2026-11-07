import { ConnectionMode, DashboardSettings, RefreshInterval, SessionSpec, TargetSpec } from '@gempba/core';

/**
 * How the Connection view reads and updates the remembered settings: one block per mode, so switching modes
 * restores what was last used for that mode, and recents that keep the latest entries first.
 */
export namespace RememberedSettings {

    export const MAX_RECENTS = 10;

    /** `value` moved to the front, without duplicates, capped at {@link MAX_RECENTS}. */
    export function recent<T>(list: readonly T[], value: T): T[] {
        return [value, ...list.filter(item => item !== value)].slice(0, MAX_RECENTS);
    }

    export function sessionOf(settings: DashboardSettings, mode: ConnectionMode): SessionSpec {
        switch (mode) {
            case ConnectionMode.HOST:
                return SessionSpec.of({ mode, host: settings.host.host, sshPort: settings.host.sshPort, sshKey: settings.host.sshKey });
            case ConnectionMode.JUMP:
                return SessionSpec.of({ mode, host: settings.jump.loginHost, sshPort: settings.jump.sshPort, sshKey: settings.jump.sshKey });
            default:
                return SessionSpec.local();
        }
    }

    export function targetOf(settings: DashboardSettings, mode: ConnectionMode): TargetSpec {
        switch (mode) {
            case ConnectionMode.HOST:
                return TargetSpec.of(undefined, settings.host.gempbaPort);
            case ConnectionMode.JUMP:
                return TargetSpec.of(settings.jump.targetHost, settings.jump.gempbaPort);
            default:
                return TargetSpec.of(undefined, settings.local.gempbaPort);
        }
    }

    /** Remembers a session the user connected with, and its mode as the one to restore. */
    export function withSession(settings: DashboardSettings, session: SessionSpec): DashboardSettings {
        switch (session.mode) {
            case ConnectionMode.HOST:
                return { ...settings, lastMode: session.mode, host: { ...settings.host, host: session.host, sshPort: session.sshPort, sshKey: session.sshKey } };
            case ConnectionMode.JUMP:
                return {
                    ...settings, lastMode: session.mode,
                    jump: {
                        ...settings.jump, loginHost: session.host, sshPort: session.sshPort, sshKey: session.sshKey,
                        recentLoginHosts: recent(settings.jump.recentLoginHosts, session.host)
                    }
                };
            default:
                return { ...settings, lastMode: ConnectionMode.LOCAL };
        }
    }

    /** Remembers a target the user listened to, under the session's mode. */
    export function withTarget(settings: DashboardSettings, mode: ConnectionMode, target: TargetSpec): DashboardSettings {
        const port = target.gempbaPort;
        switch (mode) {
            case ConnectionMode.HOST:
                return { ...settings, host: { ...settings.host, gempbaPort: port, recentPorts: recent(settings.host.recentPorts, port) } };
            case ConnectionMode.JUMP:
                return {
                    ...settings,
                    jump: { ...settings.jump, targetHost: target.targetHost, gempbaPort: port, recentTargets: recent(settings.jump.recentTargets, target.targetHost) }
                };
            default:
                return { ...settings, local: { ...settings.local, gempbaPort: port, recentPorts: recent(settings.local.recentPorts, port) } };
        }
    }

    export function withRates(settings: DashboardSettings, workerIntervalMs: number, nodeIntervalMs: number): DashboardSettings {
        return { ...settings, workerIntervalMs, nodeIntervalMs };
    }

    /**
     * The rate this view kept before the hub owned it as a setting, to move over to the hub as its refresh rate: the
     * worker rate, when changed from its default. The node rate has no place now that one rate drives every frame. Once
     * moved, the file holds the defaults again (see {@link withoutRates}), so nothing moves twice; it keeps the fields,
     * which the Java app also reads.
     */
    export function rateToMove(settings: DashboardSettings): number | undefined {
        const value = settings.workerIntervalMs;
        const rate = Number.isFinite(value) ? RefreshInterval.clamp(value) : RefreshInterval.DEFAULT_MS;
        return rate !== RefreshInterval.DEFAULT_MS ? rate : undefined;
    }

    /** The settings with the rates back at their defaults, once moved to the hub. */
    export function withoutRates(settings: DashboardSettings): DashboardSettings {
        return withRates(settings, RefreshInterval.DEFAULT_MS, RefreshInterval.DEFAULT_NODE_MS);
    }
}
