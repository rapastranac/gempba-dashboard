import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { Container, injectable } from '@theia/core/shared/inversify';
import { ConnectionMode, SessionSpec, TargetSpec } from '@gempba/core';
import { MockEmitter } from '@gempba/telemetry/lib/node/mock/mock-emitter';
import { AuthPrompt } from '../common/auth-prompt';
import { HostTunnelProvider, JumpTunnelProvider } from './ssh-tunnel-provider';
import { TestSshServer } from './testing/test-ssh-server';

let sshDir = '';

/** The real provider with its ~/.ssh redirected to a scratch directory. */
@injectable()
class ScratchHostTunnelProvider extends HostTunnelProvider {
    protected override sshDir(): string {
        return sshDir;
    }
}

const trustingPrompt: AuthPrompt = {
    keyboardInteractive: async () => undefined,
    passphrase: async () => undefined,
    confirmHostKey: async () => true
};

describe('SshTunnelProvider', function (): void {
    this.timeout(10_000);

    let dir: string;
    let emitter: MockEmitter;
    let server: TestSshServer;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-provider-'));
        sshDir = path.join(dir, '.ssh');
        fs.mkdirSync(sshDir);
        const pair = TestSshServer.generateKeyPair();
        fs.writeFileSync(path.join(sshDir, 'id_ed25519'), pair.private);
        emitter = new MockEmitter({ frames: MockEmitter.load(MockEmitter.DEFAULT_FIXTURE) });
        server = new TestSshServer({ authorizedKey: pair.public, forwardTo: await emitter.listen() });
    });

    afterEach(async () => {
        await server.close();
        await emitter.close();
        fs.rmSync(dir, { recursive: true, force: true });
    });

    function container(): Container {
        const result = new Container();
        result.bind(AuthPrompt).toConstantValue(trustingPrompt);
        result.bind(ScratchHostTunnelProvider).toSelf();
        result.bind(JumpTunnelProvider).toSelf();
        return result;
    }

    it('serves its own mode', () => {
        const providers = container();
        expect([providers.get(ScratchHostTunnelProvider).mode, providers.get(JumpTunnelProvider).mode]).to.deep.equal([ConnectionMode.HOST, ConnectionMode.JUMP]);
    });

    it('opens a tunnel with the default key and remembers the host in its known_hosts', async () => {
        const port = await server.listen();
        const tunnel = await container().get(ScratchHostTunnelProvider).open(SessionSpec.of({ mode: ConnectionMode.HOST, host: '127.0.0.1', sshPort: port }));
        const forward = await tunnel.forward(TargetSpec.of(undefined, 9000));
        const first = await new Promise<string>(resolve => {
            const socket = net.createConnection({ host: '127.0.0.1', port: forward.port });
            socket.once('data', chunk => {
                socket.destroy();
                resolve(chunk.toString('utf8'));
            });
        });
        expect(first.startsWith('{"version":2')).to.equal(true);
        expect(fs.readFileSync(path.join(sshDir, 'known_hosts'), 'utf8')).to.contain(`[127.0.0.1]:${port} ssh-ed25519 `);
        forward.close();
        tunnel.close();
    });
});
