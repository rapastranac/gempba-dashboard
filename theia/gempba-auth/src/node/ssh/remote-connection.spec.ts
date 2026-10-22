import { expect } from 'chai';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { ConnectionMode, SessionSpec, TargetSpec } from '@gempba/core';
import { MockEmitter } from '@gempba/telemetry/lib/node/mock/mock-emitter';
import { BroadcastEnvelope } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { ParsedKey, utils } from 'ssh2';
import { AuthPrompt } from '../../common/auth-prompt';
import { KnownHosts } from '../host-key/known-hosts';
import { TestSshServer, TestSshServerOptions } from '../testing/test-ssh-server';
import { RemoteConnection, RemoteConnectionOptions } from './remote-connection';

class ScriptedPrompt implements AuthPrompt {
    readonly calls: string[] = [];
    trustHost = true;
    passcodes: (string | undefined)[] = [];
    passphraseAnswer: string | undefined;

    async keyboardInteractive(name: string, _instruction: string, fields: AuthPrompt.Field[]): Promise<string[] | undefined> {
        this.calls.push(`keyboard ${name}: ${fields.map(field => `${field.label}${field.echo ? '' : ' (hidden)'}`).join(', ')}`);
        const answer = this.passcodes.shift();
        return answer === undefined ? undefined : [answer];
    }

    async passphrase(keyPath: string): Promise<string | undefined> {
        this.calls.push(`passphrase ${path.basename(keyPath)}`);
        return this.passphraseAnswer;
    }

    async confirmHostKey(host: string, keyType: string): Promise<boolean> {
        this.calls.push(`host ${host} ${keyType}`);
        return this.trustHost;
    }
}

/** Reads the first telemetry line through a forward. */
function firstFrame(port: number): Promise<BroadcastEnvelope> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        let buffered = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            buffered += chunk;
            const newline = buffered.indexOf('\n');
            if (newline >= 0) {
                socket.destroy();
                resolve(BroadcastEnvelope.parse(buffered.slice(0, newline)));
            }
        });
        socket.on('error', reject);
    });
}

describe('RemoteConnection', function (): void {
    this.timeout(10_000);

    let dir: string;
    let emitter: MockEmitter;
    let emitterPort: number;
    let server: TestSshServer | undefined;
    let connection: RemoteConnection | undefined;
    let prompt: ScriptedPrompt;
    let keyFile: string;
    let publicKey: string;

    before(async () => {
        emitter = new MockEmitter({ frames: MockEmitter.load(MockEmitter.DEFAULT_FIXTURE), workerIntervalMs: 50 });
        emitterPort = await emitter.listen();
    });

    after(() => emitter.close());

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-ssh-'));
        fs.mkdirSync(path.join(dir, 'ssh'));
        prompt = new ScriptedPrompt();
        writeKey();
    });

    afterEach(async () => {
        connection?.close();
        connection = undefined;
        await server?.close();
        server = undefined;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    function writeKey(passphrase?: string): void {
        const pair = TestSshServer.generateKeyPair(passphrase);
        keyFile = path.join(dir, 'id_test');
        fs.writeFileSync(keyFile, pair.private);
        publicKey = pair.public;
    }

    async function serve(options: Partial<TestSshServerOptions> = {}): Promise<number> {
        server = new TestSshServer({ authorizedKey: publicKey, forwardTo: emitterPort, ...options });
        return server.listen();
    }

    function options(mode: ConnectionMode, sshPort: number): RemoteConnectionOptions {
        return {
            session: SessionSpec.of({ mode, host: 'tester@127.0.0.1', sshPort, sshKey: keyFile }),
            prompt,
            knownHosts: new KnownHosts(path.join(dir, 'known_hosts')),
            sshDir: path.join(dir, 'ssh'),
            defaultUser: 'tester',
            forwardReadyTimeoutMs: 3000
        };
    }

    async function connect(mode: ConnectionMode, sshPort: number): Promise<RemoteConnection> {
        connection = await RemoteConnection.connect(options(mode, sshPort));
        return connection;
    }

    it('HOST: trusts a new host once, then forwards to the target', async () => {
        const port = await serve();
        const host = await connect(ConnectionMode.HOST, port);
        expect(prompt.calls).to.deep.equal([`host [127.0.0.1]:${port} ssh-ed25519`]);
        expect(new KnownHosts(path.join(dir, 'known_hosts')).check('127.0.0.1', port, server!.hostKey.getPublicSSH())).to.equal('trusted');

        const forward = await host.openForward(TargetSpec.of(undefined, 9000));
        expect((await firstFrame(forward.port)).workers).to.have.lengthOf(4);
        forward.close();

        host.close();
        prompt.calls.length = 0;
        await connect(ConnectionMode.HOST, port);
        expect(prompt.calls).to.deep.equal([]);
    });

    it('a forward whose session dropped closes each connection instead of throwing', async () => {
        const port = await serve();
        const host = await connect(ConnectionMode.HOST, port);
        const forward = await host.openForward(TargetSpec.of(undefined, 9000));
        await server!.close();
        server = undefined;
        await new Promise(resolve => setTimeout(resolve, 200));
        const closed = await new Promise<boolean>(resolve => {
            const socket = net.createConnection({ host: '127.0.0.1', port: forward.port });
            socket.on('error', () => undefined);
            socket.on('close', () => resolve(true));
        });
        expect(closed).to.equal(true);
        forward.close();
    });

    it('closing the session closes the forwards still open over it', async () => {
        const port = await serve();
        const host = await connect(ConnectionMode.HOST, port);
        const forward = await host.openForward(TargetSpec.of(undefined, 9000));
        host.close();
        const refused = await new Promise<boolean>(resolve => {
            const socket = net.createConnection({ host: '127.0.0.1', port: forward.port });
            socket.on('connect', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => resolve(true));
        });
        expect(refused).to.equal(true);
    });

    it('refuses a changed host key without asking', async () => {
        const port = await serve();
        const otherKey = utils.parseKey(TestSshServer.generateKeyPair().public) as ParsedKey;
        new KnownHosts(path.join(dir, 'known_hosts')).add('127.0.0.1', port, otherKey.getPublicSSH());
        const error = await RemoteConnection.connect(options(ConnectionMode.HOST, port)).catch(e => e);
        expect(error.message).to.equal('ssh to 127.0.0.1 failed: the host key of 127.0.0.1 was refused (changed, or not trusted)');
        expect(prompt.calls).to.deep.equal([]);
    });

    it('stops when the user does not trust a new host', async () => {
        const port = await serve();
        prompt.trustHost = false;
        const error = await RemoteConnection.connect(options(ConnectionMode.HOST, port)).catch(e => e);
        expect(error.message).to.contain('was refused');
    });

    it('answers an MFA round after the key, hiding the passcode', async () => {
        const port = await serve({ passcode: '123456' });
        prompt.passcodes = ['123456'];
        await connect(ConnectionMode.HOST, port);
        expect(prompt.calls.slice(1)).to.deep.equal(['keyboard Duo: Passcode:  (hidden)']);
    });

    it('re-asks a wrong passcode, up to three rounds', async () => {
        const port = await serve({ passcode: '123456' });
        prompt.passcodes = ['000000', '111111', '222222'];
        const error = await RemoteConnection.connect(options(ConnectionMode.HOST, port)).catch(e => e);
        expect(error).to.be.instanceOf(Error);
        expect(prompt.calls.filter(call => call.startsWith('keyboard'))).to.have.lengthOf(3);
    });

    it('a cancelled MFA prompt aborts', async () => {
        const port = await serve({ passcode: '123456' });
        const error = await RemoteConnection.connect(options(ConnectionMode.HOST, port)).catch(e => e);
        expect(error.message).to.equal('ssh to 127.0.0.1 failed: authentication was cancelled');
        expect(prompt.calls.filter(call => call.startsWith('keyboard'))).to.have.lengthOf(1);
    });

    it('asks for the passphrase of an encrypted key', async () => {
        writeKey('s3cret');
        const port = await serve();
        prompt.passphraseAnswer = 's3cret';
        await connect(ConnectionMode.HOST, port);
        expect(prompt.calls).to.include('passphrase id_test');
    });

    it('JUMP: runs the hop on the login node and forwards through it', async () => {
        const port = await serve({ hop: 'open' });
        const jump = await connect(ConnectionMode.JUMP, port);
        const forward = await jump.openForward(TargetSpec.of('tester@node7', 9000));
        expect(server!.execs).to.have.lengthOf(1);
        expect(server!.execs[0]).to.match(/^ssh -v -N -o BatchMode=yes .* -L 127\.0\.0\.1:\d+:127\.0\.0\.1:9000 node7$/);
        expect((await firstFrame(forward.port)).workers).to.have.lengthOf(4);
        forward.close();
    });

    it('JUMP: a failing hop reports the tail of its output', async () => {
        const port = await serve({ hop: 'fail' });
        const jump = await connect(ConnectionMode.JUMP, port);
        const error = await jump.openForward(TargetSpec.of('node7', 9000)).catch(e => e);
        expect(error.message).to.equal('the login node could not reach node7 (inner ssh exited code 255): '
            + 'debug1: Connecting to node | ssh: connect to host node7 port 22: Connection refused');
    });

    it('JUMP: refuses a compute node name that is not a plain host', async () => {
        const port = await serve({ hop: 'open' });
        const jump = await connect(ConnectionMode.JUMP, port);
        const error = await jump.openForward(TargetSpec.of('node7;reboot', 9000)).catch(e => e);
        expect(error.message).to.equal("unsafe or empty compute node name in 'node7;reboot'");
        expect(server!.execs).to.deep.equal([]);
    });
});
