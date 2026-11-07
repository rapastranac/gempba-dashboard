import * as net from 'net';
import { Duplex } from 'stream';
import { Connection, ParsedKey, PublicKeyAuthContext, Server, ServerChannel } from 'ssh2';
import { ConnectionMode } from '@gempba/core';
import { MockAggregator } from './mock-aggregator';

export interface MockSshOptions {
    /** HOST: the server is the VM gempba runs on. JUMP: it is the login node, and gempba runs on a compute node behind it. */
    readonly mode: ConnectionMode.HOST | ConnectionMode.JUMP;
    readonly hostKey: string;
    /** The public keys the server accepts; with none, it refuses everyone. */
    readonly authorizedKeys: readonly ParsedKey[];
    /** When set, a passcode must follow the key, as a Duo prompt does after `publickey`. */
    readonly mfaCode?: string;
    readonly gempbaPort: number;
    /** Whether a compute node of that name exists behind the login node. */
    readonly isNode: (name: string) => boolean;
    readonly log: (message: string) => void;
}

/** One `ssh -N -L 127.0.0.1:mid:127.0.0.1:port node` hop running on the login node. */
interface Hop {
    readonly port: number;
    readonly node: string;
    readonly streams: Set<Duplex>;
}

/**
 * Host and Jump modes: a real SSH server on a loopback port, standing in for the VM or the login node.
 * - Auth is publickey, optionally followed by a keyboard-interactive passcode with three tries.
 * - Host mode forwards `direct-tcpip` to the gempba port into the mock's telemetry, as sshd on the VM would.
 * - Jump mode runs the dashboard's `ssh -N -L` hop over `exec`, refusing an unknown compute node the way ssh does, and
 *   forwards only through a running hop.
 */
export class MockSshEndpoint {

    static readonly MAX_PASSCODE_TRIES = 3;
    static readonly HOP_COMMAND = /-L 127\.0\.0\.1:(\d+):127\.0\.0\.1:(\d+)\s+(?:[^@\s]+@)?(\S+)\s*$/;

    protected readonly server: Server;
    protected readonly connections = new Set<Connection>();
    protected readonly hops = new Map<number, Hop>();

    constructor(protected readonly aggregator: MockAggregator, protected readonly options: MockSshOptions) {
        this.server = new Server({ hostKeys: [options.hostKey], ident: 'GempbaMock' }, (client, info) => this.serve(client, `${info.ip}:${info.port}`));
    }

    /** Resolves with the bound port; port 0 lets the OS pick a free one. */
    listen(port: number): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, '127.0.0.1', () => {
                this.server.off('error', reject);
                resolve((this.server.address() as net.AddressInfo).port);
            });
        });
    }

    close(): Promise<void> {
        this.connections.forEach(client => client.end());
        return new Promise(resolve => this.server.close(() => resolve()));
    }

    protected serve(client: Connection, peer: string): void {
        this.connections.add(client);
        client.on('close', () => this.connections.delete(client));
        client.on('error', () => undefined);
        let keyPassed = false;
        let tries = 0;
        let user = '';
        client.on('authentication', context => {
            user = context.username;
            if (context.method === 'publickey') {
                if (!this.knows(context)) {
                    context.reject(['publickey']);
                } else if (!context.signature || !context.blob) {
                    // the client only asks whether the key would do: it would
                    context.accept();
                } else if (this.options.mfaCode === undefined) {
                    context.accept();
                } else {
                    keyPassed = true;
                    context.reject(['keyboard-interactive'], true);
                }
            } else if (context.method === 'keyboard-interactive' && keyPassed && this.options.mfaCode !== undefined) {
                context.prompt([{ prompt: 'Passcode or option (1-1): ', echo: false }], 'Two-factor authentication', `Duo two-factor login for ${user}`,
                    answers => {
                        if (answers[0]?.trim() === this.options.mfaCode) {
                            context.accept();
                        } else if (++tries >= MockSshEndpoint.MAX_PASSCODE_TRIES) {
                            this.options.log(`Refused ${user}: ${tries} wrong passcodes`);
                            context.reject([]);
                        } else {
                            context.reject(['keyboard-interactive']);
                        }
                    });
            } else {
                context.reject(keyPassed ? ['keyboard-interactive'] : ['publickey']);
            }
        });
        client.on('ready', () => {
            this.options.log(`${user} signed in over SSH from ${peer}`);
            client.on('tcpip', (accept, reject, info) => {
                const hop = this.hops.get(info.destPort);
                if (this.options.mode === ConnectionMode.HOST ? info.destPort !== this.options.gempbaPort : !hop || hop.port !== this.options.gempbaPort) {
                    // nothing listens there: no gempba on that port, or no hop running to it
                    reject();
                    return;
                }
                const stream = accept();
                hop?.streams.add(stream);
                stream.on('close', () => hop?.streams.delete(stream));
                this.aggregator.attach(stream, hop ? `${user} through the hop to ${hop.node}` : `${user} over SSH`);
            });
            client.on('session', accept => {
                const session = accept();
                session.on('pty', ptyAccept => ptyAccept?.());
                session.on('exec', (execAccept, _reject, info) => this.hop(execAccept(), info.command));
            });
        });
    }

    protected knows(context: PublicKeyAuthContext): boolean {
        return this.options.authorizedKeys.some(key => key.type === context.key.algo && key.getPublicSSH().equals(context.key.data)
            && (!context.signature || !context.blob || key.verify(context.blob, context.signature, context.hashAlgo) === true));
    }

    /** Runs the dashboard's hop as a login node would: held open while it forwards, or exiting as ssh does on failure. */
    protected hop(channel: ServerChannel, command: string): void {
        const parsed = MockSshEndpoint.HOP_COMMAND.exec(command);
        if (this.options.mode !== ConnectionMode.JUMP || !parsed) {
            channel.write(`mock: ${this.options.mode === ConnectionMode.JUMP ? 'only the dashboard\'s ssh -N -L hop runs here' : 'this VM runs no commands'}\r\n`);
            channel.exit(127);
            channel.end();
            return;
        }
        const [, mid, port, node] = parsed;
        channel.write(`debug1: Connecting to ${node} port 22.\r\n`);
        if (!this.options.isNode(node)) {
            this.options.log(`Refused the hop to ${node}: no such compute node`);
            channel.write(`ssh: Could not resolve hostname ${node}: Name or service not known\r\n`);
            channel.exit(255);
            channel.end();
            return;
        }
        const hop: Hop = { port: Number(port), node, streams: new Set() };
        this.hops.set(Number(mid), hop);
        this.options.log(`Hop to ${node} opened: 127.0.0.1:${mid} forwards to port ${port}`);
        channel.write(`debug1: Local connections to 127.0.0.1:${mid} forwarded to remote address 127.0.0.1:${port}\r\n`);
        // a channel only reports its close once its input is read
        channel.resume();
        channel.on('close', () => {
            this.hops.delete(Number(mid));
            // the hop's connections die with it
            hop.streams.forEach(stream => stream.destroy());
            this.options.log(`Hop to ${node} closed`);
        });
    }
}
