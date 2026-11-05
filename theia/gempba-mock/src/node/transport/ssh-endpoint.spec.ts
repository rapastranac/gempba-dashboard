import { expect } from 'chai';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AnyAuthMethod, Client, ClientChannel, ParsedKey, utils } from 'ssh2';
import { ConnectionMode } from '@gempba/core';
import { BroadcastEnvelope } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { MockConfig } from '../../common/mock-config';
import { MockRun } from '../sim/mock-run';
import { MockCenter } from './mock-center';
import { MockKeys } from './mock-keys';
import { MockSshEndpoint, MockSshOptions } from './ssh-endpoint';
import { MockTopology } from '../sim/mock-topology';

describe('MockKeys', () => {

    let home: string;

    beforeEach(() => home = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-mock-keys-')));
    afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

    it('creates the host key once and keeps it, so its fingerprint stays the same', () => {
        const dir = MockKeys.dir(home);
        const first = MockKeys.hostKey(dir);
        expect(MockKeys.fingerprint(first.parsed)).to.match(/^SHA256:[A-Za-z0-9+/]{43}$/);
        expect(MockKeys.fingerprint(MockKeys.hostKey(dir).parsed)).to.equal(MockKeys.fingerprint(first.parsed));
        expect(fs.existsSync(path.join(dir, 'host_ed25519.pub'))).to.equal(true);
    });

    it('generates a client key pair the dashboard can point at', () => {
        const { privatePath, parsed } = MockKeys.clientKey(MockKeys.dir(home));
        expect(privatePath).to.equal(path.join(home, '.gempba-dashboard', 'mock', 'client_ed25519'));
        expect(utils.parseKey(fs.readFileSync(privatePath, 'utf8'))).not.to.be.instanceOf(Error);
        expect(parsed.type).to.equal('ssh-ed25519');
    });

    it('draws only key pairs that parse, though ssh2 now and then writes one that does not', () => {
        for (let i = 0; i < 2048; i++) {
            const pair = MockKeys.generatePair();
            expect(utils.parseKey(pair.private)).not.to.be.instanceOf(Error);
            expect(utils.parseKey(pair.public)).not.to.be.instanceOf(Error);
        }
    });

    it('reads the user\'s public keys and authorized_keys, skipping what does not parse', () => {
        fs.mkdirSync(path.join(home, '.ssh'));
        const a = MockKeys.generatePair().public;
        const b = MockKeys.generatePair().public;
        fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519.pub'), a + '\n');
        fs.writeFileSync(path.join(home, '.ssh', 'authorized_keys'), `# mine\n${b}\nnot a key\n`);
        fs.writeFileSync(path.join(home, '.ssh', 'id_ed25519'), 'private, never read');
        expect(MockKeys.systemKeys(home)).to.have.lengthOf(2);
        expect(MockKeys.systemKeys(path.join(home, 'nobody'))).to.deep.equal([]);
    });

    it('finds a known_hosts line that holds another key for the mock, plain or hashed', () => {
        const ours = MockKeys.hostKey(MockKeys.dir(home)).parsed;
        const theirs = (utils.parseKey(MockKeys.generatePair().private) as ParsedKey).getPublicSSH().toString('base64');
        const salt = crypto.randomBytes(20);
        const hashed = crypto.createHmac('sha1', salt).update('[127.0.0.1]:2222').digest('base64');
        fs.mkdirSync(path.join(home, '.ssh'));
        const knownHosts = path.join(home, '.ssh', 'known_hosts');
        fs.writeFileSync(knownHosts, `[127.0.0.1]:2223 ssh-ed25519 ${theirs}\n[127.0.0.1]:2222 ssh-ed25519 ${ours.getPublicSSH().toString('base64')}\n`);
        expect(MockKeys.knownHostsConflict(2222, ours, home)).to.equal(undefined);
        expect(MockKeys.knownHostsConflict(2223, ours, home)).to.equal(`[127.0.0.1]:2223 ssh-ed25519 ${theirs}`);
        fs.writeFileSync(knownHosts, `|1|${salt.toString('base64')}|${hashed} ssh-ed25519 ${theirs}\n`);
        expect(MockKeys.knownHostsConflict(2222, ours, home)).to.contain('|1|');
    });
});

describe('MockSshEndpoint', () => {

    let home: string;
    let center: MockCenter;
    let endpoint: MockSshEndpoint;
    let port: number;
    let logged: string[];
    let clientKey: string;
    const clients: Client[] = [];

    async function serve(mode: ConnectionMode.HOST | ConnectionMode.JUMP, options: Partial<MockSshOptions> = {}): Promise<void> {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-mock-ssh-'));
        logged = [];
        const dir = MockKeys.dir(home);
        const client = MockKeys.clientKey(dir);
        clientKey = fs.readFileSync(client.privatePath, 'utf8');
        const defaults = MockConfig.defaults();
        const run = new MockRun(defaults.shape, defaults.scheduler, defaults.live, 42);
        center = new MockCenter(run, { log: message => logged.push(message) });
        center.start();
        const hosts = run.topology.nodes.map(node => node.host);
        endpoint = new MockSshEndpoint(center, {
            mode, hostKey: MockKeys.hostKey(dir).privateKey, authorizedKeys: [client.parsed], gempbaPort: 9000, isNode: name => hosts.includes(name),
            log: message => logged.push(message), ...options
        });
        port = await endpoint.listen(0);
    }

    /** Signs in the dashboard's way: the key first, then up to three keyboard-interactive rounds. */
    function connect(options: { privateKey?: string, answers?: string[] } = {}): Promise<Client> {
        return new Promise((resolve, reject) => {
            const client = new Client();
            clients.push(client);
            const answers = [...(options.answers ?? [])];
            let keyTried = false;
            let rounds = 0;
            client.on('ready', () => resolve(client));
            client.on('error', reject);
            client.connect({
                host: '127.0.0.1', port, username: 'tester', hostVerifier: () => true,
                authHandler: (methodsLeft, _partialSuccess, next) => {
                    const allowed = (method: string) => !methodsLeft || methodsLeft.includes(method as never);
                    if (!keyTried && allowed('publickey')) {
                        keyTried = true;
                        next({ type: 'publickey', username: 'tester', key: options.privateKey ?? clientKey });
                    } else if (allowed('keyboard-interactive') && rounds < 3) {
                        rounds++;
                        next({ type: 'keyboard-interactive', username: 'tester', prompt: (_name, _instructions, _lang, _prompts, finish) => finish([answers.shift() ?? '']) });
                    } else {
                        next(false as unknown as AnyAuthMethod);
                    }
                }
            });
        });
    }

    function forward(client: Client, destPort: number): Promise<ClientChannel> {
        return new Promise((resolve, reject) => client.forwardOut('127.0.0.1', 0, '127.0.0.1', destPort, (error, stream) => error ? reject(error) : resolve(stream)));
    }

    function firstLine(stream: ClientChannel): Promise<string> {
        return new Promise(resolve => {
            let buffered = '';
            stream.on('data', (chunk: Buffer) => {
                buffered += chunk.toString();
                if (buffered.includes('\n')) {
                    resolve(buffered.slice(0, buffered.indexOf('\n')));
                }
            });
        });
    }

    function exec(client: Client, command: string): Promise<{ channel: ClientChannel, output: () => string, exited: Promise<number | undefined> }> {
        return new Promise((resolve, reject) => client.exec(command, { pty: true }, (error, channel) => {
            if (error) {
                reject(error);
                return;
            }
            let output = '';
            channel.on('data', (chunk: Buffer) => output += chunk.toString());
            const exited = new Promise<number | undefined>(done => channel.on('exit', (code: number) => done(code)));
            resolve({ channel, output: () => output, exited });
        }));
    }

    async function until(condition: () => boolean): Promise<void> {
        const deadline = Date.now() + 3000;
        while (!condition()) {
            if (Date.now() > deadline) {
                throw new Error('timed out');
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    afterEach(async () => {
        clients.splice(0).forEach(client => client.end());
        center.stop();
        await endpoint.close();
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('serves Host mode: a known key signs in, and a forward to the gempba port streams frames', async () => {
        await serve(ConnectionMode.HOST);
        const client = await connect();
        const line = await firstLine(await forward(client, 9000));
        expect(BroadcastEnvelope.parse(line).workers).to.have.lengthOf(8);
        expect(logged.some(message => message.startsWith('tester signed in over SSH from 127.0.0.1:'))).to.equal(true);
        await until(() => logged.includes('tester over SSH connected'));
        let refused: unknown;
        await forward(client, 9001).catch(error => refused = error);
        expect(refused).to.be.instanceOf(Error);
    });

    it('refuses an unknown key, and everyone when it accepts no key', async () => {
        await serve(ConnectionMode.HOST);
        const stranger = MockKeys.generatePair().private;
        let failed: unknown;
        await connect({ privateKey: stranger }).catch(error => failed = error);
        expect(String(failed)).to.contain('All configured authentication methods failed');
        await endpoint.close();
        endpoint = new MockSshEndpoint(center, {
            mode: ConnectionMode.HOST, hostKey: MockKeys.hostKey(MockKeys.dir(home)).privateKey, authorizedKeys: [], gempbaPort: 9000, isNode: () => true, log: () => undefined
        });
        port = await endpoint.listen(0);
        failed = undefined;
        await connect().catch(error => failed = error);
        expect(String(failed)).to.contain('All configured authentication methods failed');
    });

    it('asks for a passcode after the key when MFA is on, and gives up after three wrong ones', async () => {
        await serve(ConnectionMode.HOST, { mfaCode: '123456' });
        await connect({ answers: ['000000', '123456'] });
        let failed: unknown;
        await connect({ answers: ['1', '2', '3', '123456'] }).catch(error => failed = error);
        expect(failed).to.be.instanceOf(Error);
        expect(logged).to.include('Refused tester: 3 wrong passcodes');
    });

    it('serves Jump mode through the dashboard\'s hop only, closing its connections when the hop ends', async () => {
        await serve(ConnectionMode.JUMP);
        const client = await connect();
        let refused: unknown;
        await forward(client, 9000).catch(error => refused = error);
        expect(refused, 'the login node runs no gempba').to.be.instanceOf(Error);
        const command = 'ssh -v -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new '
            + `-L 127.0.0.1:31337:127.0.0.1:9000 ${MockTopology.hostName(1)}`;
        const hop = await exec(client, command);
        await until(() => hop.output().includes('forwarded to remote address 127.0.0.1:9000'));
        const stream = await forward(client, 31337);
        expect(BroadcastEnvelope.parse(await firstLine(stream)).nodes).to.have.lengthOf(2);
        expect(logged).to.include('Hop to mock-host-02 opened: 127.0.0.1:31337 forwards to port 9000');
        let closed = false;
        stream.on('close', () => closed = true);
        hop.channel.close();
        await until(() => closed);
    });

    it('fails a hop to an unknown compute node the way ssh does', async () => {
        await serve(ConnectionMode.JUMP);
        const client = await connect();
        const hop = await exec(client, 'ssh -v -N -L 127.0.0.1:31338:127.0.0.1:9000 node7');
        expect(await hop.exited).to.equal(255);
        expect(hop.output()).to.contain('Could not resolve hostname node7');
        let refused: unknown;
        await forward(client, 31338).catch(error => refused = error);
        expect(refused).to.be.instanceOf(Error);
    });
});
