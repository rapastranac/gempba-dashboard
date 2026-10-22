import * as net from 'net';
import { Connection, ParsedKey, Server, utils } from 'ssh2';

export interface TestSshServerOptions {
    /** The one client key the server accepts (its public half, OpenSSH format). */
    readonly authorizedKey: string;
    /** When set, publickey succeeds only partially and this passcode must follow, like `publickey,keyboard-interactive`. */
    readonly passcode?: string;
    /** Every forward the client opens lands on this loopback port, whatever its destination. */
    readonly forwardTo: number;
    /** How an exec'd JUMP hop behaves: held open, or exiting with an ssh error. */
    readonly hop?: 'open' | 'fail';
}

/**
 * A real SSH server on a loopback port for tests, standing in for a VM or a login node the way the Python mocker
 * does for manual testing: publickey and optional MFA, direct-tcpip forwards, and an `ssh -N -L` hop over exec.
 */
export class TestSshServer {

    readonly hostKey: ParsedKey;
    readonly execs: string[] = [];
    protected readonly server: Server;
    protected readonly authorized: ParsedKey;
    protected readonly clients = new Set<Connection>();
    protected readonly deadHopPorts = new Set<number>();

    constructor(protected readonly options: TestSshServerOptions) {
        const pair = TestSshServer.generateKeyPair();
        this.hostKey = utils.parseKey(pair.private) as ParsedKey;
        this.authorized = utils.parseKey(options.authorizedKey) as ParsedKey;
        this.server = new Server({ hostKeys: [pair.private] }, client => {
            let publicKeyPassed = false;
            this.clients.add(client);
            client.on('close', () => this.clients.delete(client));
            client.on('error', () => undefined);
            client.on('authentication', context => {
                if (context.method === 'publickey') {
                    const key = context.key;
                    if (key.algo !== this.authorized.type || !key.data.equals(this.authorized.getPublicSSH())) {
                        context.reject();
                    } else if (!context.signature || !context.blob) {
                        context.accept();
                    } else if (!this.authorized.verify(context.blob, context.signature, context.hashAlgo)) {
                        context.reject();
                    } else if (options.passcode !== undefined) {
                        publicKeyPassed = true;
                        context.reject(['keyboard-interactive'], true);
                    } else {
                        context.accept();
                    }
                } else if (context.method === 'keyboard-interactive' && publicKeyPassed && options.passcode !== undefined) {
                    context.prompt([{ prompt: 'Passcode: ', echo: false }], 'Duo', answers => {
                        if (answers[0] === options.passcode) {
                            context.accept();
                        } else {
                            context.reject(['keyboard-interactive']);
                        }
                    });
                } else {
                    context.reject(publicKeyPassed ? ['keyboard-interactive'] : ['publickey']);
                }
            });
            client.on('ready', () => {
                client.on('tcpip', (accept, reject, info) => {
                    if (this.deadHopPorts.has(info.destPort)) {
                        reject();
                        return;
                    }
                    const stream = accept();
                    const socket = net.createConnection({ host: '127.0.0.1', port: options.forwardTo });
                    socket.on('error', () => stream.close());
                    stream.on('error', () => socket.destroy());
                    stream.on('close', () => socket.destroy());
                    socket.pipe(stream).pipe(socket);
                });
                client.on('session', accept => {
                    const session = accept();
                    session.on('pty', ptyAccept => ptyAccept?.());
                    session.on('exec', (execAccept, _reject, info) => {
                        this.execs.push(info.command);
                        const stream = execAccept();
                        stream.write('debug1: Connecting to node\r\n');
                        if (options.hop === 'fail') {
                            // Nothing listens on the hop's port once it has exited, as on a real login node.
                            const hopPort = /-L 127\.0\.0\.1:(\d+):/.exec(info.command)?.[1];
                            if (hopPort) {
                                this.deadHopPorts.add(Number(hopPort));
                            }
                            // Exit a moment later, so the client's readiness probe runs while the hop is still dying.
                            setTimeout(() => {
                                stream.write('ssh: connect to host node7 port 22: Connection refused\r\n');
                                stream.exit(255);
                                stream.end();
                            }, 300);
                        }
                    });
                });
            });
        });
    }

    /** An ed25519 pair; ssh2's generator emits an unparseable key about once in 150 tries, so those are redrawn. */
    static generateKeyPair(passphrase?: string): { private: string, public: string } {
        for (; ;) {
            const pair = passphrase ? utils.generateKeyPairSync('ed25519', { passphrase, cipher: 'aes256-cbc', rounds: 16 }) : utils.generateKeyPairSync('ed25519');
            if (!(utils.parseKey(pair.private, passphrase) instanceof Error)) {
                return pair;
            }
        }
    }

    listen(): Promise<number> {
        return new Promise(resolve => this.server.listen(0, '127.0.0.1', () => resolve((this.server.address() as net.AddressInfo).port)));
    }

    close(): Promise<void> {
        this.clients.forEach(client => client.end());
        return new Promise(resolve => this.server.close(() => resolve()));
    }
}
