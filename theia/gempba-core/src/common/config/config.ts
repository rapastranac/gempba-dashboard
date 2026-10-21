import { isBlank } from './values';

const INT_PATTERN = /^[+-]?\d+$/;
const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

/**
 * The startup connection hints, resolved CLI > environment > defaults. Invalid or blank values
 * fall back to the next tier so the dashboard always starts. gempba only listens on 127.0.0.1,
 * so reaching another machine means an SSH tunnel.
 */
export interface Config {
    readonly port: number;
    readonly sshHost: string;
    readonly jumpHost: string;
    readonly sshKey: string;
}

export namespace Config {

    export const DEFAULT_PORT = 9000;

    export const ENV_PORT = 'GEMPBA_TELEMETRY_PORT';
    export const ENV_SSH_HOST = 'GEMPBA_TELEMETRY_SSH_HOST';
    export const ENV_JUMP_HOST = 'GEMPBA_TELEMETRY_JUMP_HOST';
    export const ENV_SSH_KEY = 'GEMPBA_TELEMETRY_SSH_KEY';

    export type Environment = (name: string) => string | undefined;

    export function of(config: Partial<Config> & Pick<Config, 'port'>): Config {
        return { port: config.port, sshHost: config.sshHost ?? '', jumpHost: config.jumpHost ?? '', sshKey: config.sshKey ?? '' };
    }

    export function from(args: readonly string[], env: Environment): Config {
        let port = parseIntOr(env(ENV_PORT), DEFAULT_PORT);
        let sshHost = orDefault(env(ENV_SSH_HOST), '');
        let jumpHost = orDefault(env(ENV_JUMP_HOST), '');
        let sshKey = orDefault(env(ENV_SSH_KEY), '');

        for (let i = 0; i < args.length; i++) {
            const arg = args[i];
            const hasNext = i + 1 < args.length;
            if (arg.startsWith('--port=')) {
                port = parseIntOr(arg.substring('--port='.length), port);
            } else if (arg.startsWith('--ssh-host=')) {
                sshHost = arg.substring('--ssh-host='.length);
            } else if (arg.startsWith('--jump-host=')) {
                jumpHost = arg.substring('--jump-host='.length);
            } else if (arg.startsWith('--ssh-key=')) {
                sshKey = arg.substring('--ssh-key='.length);
            } else if (arg === '--port' && hasNext) {
                port = parseIntOr(args[++i], port);
            } else if (arg === '--ssh-host' && hasNext) {
                sshHost = args[++i];
            } else if (arg === '--jump-host' && hasNext) {
                jumpHost = args[++i];
            } else if (arg === '--ssh-key' && hasNext) {
                sshKey = args[++i];
            }
        }
        return { port, sshHost, jumpHost, sshKey };
    }

    export function usesSshTunnel(config: Config): boolean {
        return !isBlank(config.sshHost);
    }

    function orDefault(value: string | undefined, fallback: string): string {
        return isBlank(value) ? fallback : value!;
    }

    function parseIntOr(value: string | undefined, fallback: number): number {
        const trimmed = value?.trim() ?? '';
        if (!INT_PATTERN.test(trimmed)) {
            return fallback;
        }
        const parsed = Number(trimmed);
        return parsed >= INT_MIN && parsed <= INT_MAX ? parsed : fallback;
    }
}
