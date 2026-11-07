const INT_PATTERN = /^[+-]?\d+$/;

/** A parsed `user@host[:port]` SSH endpoint, shared by the login/VM host and the JUMP compute node. */
export interface SshEndpoint {
    readonly user: string;
    readonly host: string;
    readonly port: number;
}

export namespace SshEndpoint {

    export const DEFAULT_PORT = 22;

    /**
     * A missing user falls back to `defaultUser` (the OS login name, supplied by the backend);
     * a missing or non-numeric port leaves the whole remainder as the host and uses 22.
     */
    export function parse(spec: string | undefined, defaultUser: string): SshEndpoint {
        const text = (spec ?? '').trim();
        const at = text.indexOf('@');
        const user = at >= 0 ? text.substring(0, at) : defaultUser;
        const hostPort = at >= 0 ? text.substring(at + 1) : text;
        const colon = hostPort.lastIndexOf(':');
        let host = hostPort;
        let port = DEFAULT_PORT;
        if (colon > 0) {
            const portText = hostPort.substring(colon + 1).trim();
            if (INT_PATTERN.test(portText)) {
                port = Number(portText);
                host = hostPort.substring(0, colon);
            }
        }
        return { user: user.trim(), host: host.trim(), port };
    }
}
