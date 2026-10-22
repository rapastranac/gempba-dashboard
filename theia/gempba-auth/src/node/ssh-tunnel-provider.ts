import * as os from 'os';
import * as path from 'path';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConnectionMode, SessionSpec } from '@gempba/core';
import { Tunnel, TunnelProvider } from '@gempba/telemetry/lib/node/tunnel/tunnel-provider';
import { AuthPrompt } from '../common/auth-prompt';
import { KnownHosts } from './host-key/known-hosts';
import { RemoteConnection } from './ssh/remote-connection';

/** Opens an SSH session for its mode, prompting the window that asked; keys and known_hosts are the user's own ~/.ssh. */
@injectable()
export abstract class SshTunnelProvider implements TunnelProvider {

    abstract readonly mode: ConnectionMode;

    @inject(AuthPrompt) protected readonly prompt: AuthPrompt;

    async open(session: SessionSpec): Promise<Tunnel> {
        const connection = await RemoteConnection.connect({
            session,
            prompt: this.prompt,
            knownHosts: new KnownHosts(path.join(this.sshDir(), 'known_hosts')),
            sshDir: this.sshDir(),
            defaultUser: defaultUser()
        });
        return {
            forward: target => connection.openForward(target),
            close: () => connection.close()
        };
    }

    protected sshDir(): string {
        return path.join(os.homedir(), '.ssh');
    }
}

@injectable()
export class HostTunnelProvider extends SshTunnelProvider {
    readonly mode = ConnectionMode.HOST;
}

@injectable()
export class JumpTunnelProvider extends SshTunnelProvider {
    readonly mode = ConnectionMode.JUMP;
}

function defaultUser(): string {
    try {
        return os.userInfo().username;
    } catch {
        return '';
    }
}
