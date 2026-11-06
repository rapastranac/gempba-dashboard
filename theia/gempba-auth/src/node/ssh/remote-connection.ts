import * as crypto from 'crypto';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { ConnectionMode, SessionSpec, SshEndpoint, TargetSpec } from '@gempba/core';
import { Forward } from '@gempba/telemetry/lib/node/tunnel/tunnel-provider';
import { AnyAuthMethod, AuthenticationType, Client, ClientChannel, KeyboardInteractiveCallback, ParsedKey, Prompt, utils } from 'ssh2';
import { AuthPrompt } from '../../common/auth-prompt';
import { HostKeyVerifier } from '../host-key/host-key-verifier';
import { KnownHosts } from '../host-key/known-hosts';
import { LocalForward } from './local-forward';

export interface RemoteConnectionOptions {
    readonly session: SessionSpec;
    readonly prompt: AuthPrompt;
    readonly knownHosts: KnownHosts;
    /** Where the default identities (`id_ed25519`, …) are offered from: `~/.ssh` in the app. */
    readonly sshDir: string;
    /** The user when the host has no `user@`: the OS login name in the app. */
    readonly defaultUser: string;
    readonly readyTimeoutMs?: number;
    readonly forwardReadyTimeoutMs?: number;
}

/**
 * A persistent, authenticated SSH session to the VM (HOST) or the login node (JUMP), established once, paying any
 * MFA cost, and held until disconnect. Each target gets a cheap {@link Forward} over it, never re-authenticating.
 * JUMP runs the hop to the compute node on the login node itself (`ssh -N -L` over a PTY exec channel), so it uses
 * the cluster's own node-to-node trust and closing the channel hangs the hop up. ProxyJump would not do: this machine
 * would complete the handshake with the compute node, which trusts only connections from a login node and asks for a
 * password the user doesn't have.
 */
export class RemoteConnection {

    /** Generous: the handshake includes the user answering a host-key or MFA prompt. */
    static readonly DEFAULT_READY_TIMEOUT_MS = 120_000;
    static readonly DEFAULT_FORWARD_READY_TIMEOUT_MS = 20_000;
    /** Keeps an idle session (between targets) alive: a ping every 30 s, dead after about 3 minutes of silence. */
    static readonly KEEPALIVE_INTERVAL_MS = 30_000;
    static readonly KEEPALIVE_COUNT_MAX = 6;
    /** OpenSSH's default identity names, in its order. */
    static readonly DEFAULT_KEY_NAMES = ['id_ed25519', 'id_ecdsa', 'id_ecdsa_sk', 'id_ed25519_sk', 'id_rsa', 'id_dsa'];
    static readonly MAX_KEYBOARD_ROUNDS = 3;
    /** The compute node name is interpolated into a shell command on the login node. */
    static readonly SAFE_HOST = /^[A-Za-z0-9._-]+$/;

    protected readonly forwards = new Set<LocalForward>();
    protected readonly onCloseEmitter = new Emitter<Error | undefined>();
    /** Fires once when the session ends without {@link close}, with the last error the client reported, if any. */
    readonly onClose: Event<Error | undefined> = this.onCloseEmitter.event;
    protected closing = false;

    protected constructor(protected readonly client: Client, protected readonly mode: ConnectionMode, protected readonly options: RemoteConnectionOptions,
        protected readonly hostLabel: string) { }

    static connect(options: RemoteConnectionOptions): Promise<RemoteConnection> {
        const { session, prompt } = options;
        if (session.mode === ConnectionMode.LOCAL) {
            return Promise.reject(new Error('LOCAL connections do not use SSH'));
        }
        const endpoint = SshEndpoint.parse(session.host, options.defaultUser);
        const port = endpoint.port !== SshEndpoint.DEFAULT_PORT ? endpoint.port : session.sshPort;
        const verifier = new HostKeyVerifier(options.knownHosts, prompt);
        const auth = new AuthSequence(endpoint.user, identityFiles(session.sshKey, options.sshDir), prompt, session.sshKey);
        const client = new Client();
        let hostKeyRefused = false;
        return new Promise((resolve, reject) => {
            const fail = (error: Error) => {
                client.end();
                const reason = hostKeyRefused ? `the host key of ${endpoint.host} was refused (changed, or not trusted)`
                    : auth.cancelled ? 'authentication was cancelled' : error.message;
                reject(new Error(`ssh to ${endpoint.host} failed: ${reason}`));
            };
            client.once('ready', () => {
                client.removeListener('error', fail);
                const connection = new RemoteConnection(client, session.mode, options, endpoint.host);
                connection.watchSession();
                resolve(connection);
            });
            client.once('error', fail);
            client.connect({
                host: endpoint.host,
                port,
                username: endpoint.user,
                readyTimeout: options.readyTimeoutMs ?? RemoteConnection.DEFAULT_READY_TIMEOUT_MS,
                keepaliveInterval: RemoteConnection.KEEPALIVE_INTERVAL_MS,
                keepaliveCountMax: RemoteConnection.KEEPALIVE_COUNT_MAX,
                hostVerifier: (key: Buffer, verify: (valid: boolean) => void) => {
                    verifier.verify(endpoint.host, port, key).then(trusted => {
                        hostKeyRefused = !trusted;
                        verify(trusted);
                    }, () => verify(false));
                },
                authHandler: (methodsLeft, _partialSuccess, next) => {
                    // ssh2 stops authenticating when handed false, which its typings do not declare.
                    const stop = false as unknown as AnyAuthMethod;
                    auth.next(methodsLeft).then(method => next(method || stop), () => next(stop));
                }
            });
        });
    }

    openForward(target: TargetSpec): Promise<Forward> {
        return this.mode === ConnectionMode.JUMP ? this.openHop(target) : this.openLocal(target.gempbaPort);
    }

    /** Ends the session and every forward still open over it, as closing an SSH session does. */
    close(): void {
        this.closing = true;
        [...this.forwards].forEach(forward => forward.close());
        this.client.end();
    }

    /**
     * Reports a session that ends on its own: the server closing it, a dropped network, or ssh2's keepalive giving up.
     * Its forwards can no longer reach anything, so they close too.
     */
    protected watchSession(): void {
        let lastError: Error | undefined;
        this.client.on('error', error => lastError = error);
        this.client.once('close', () => {
            [...this.forwards].forEach(forward => forward.close());
            if (!this.closing) {
                this.onCloseEmitter.fire(lastError);
            }
            this.onCloseEmitter.dispose();
        });
    }

    protected async openLocal(dstPort: number, hop?: ClientChannel): Promise<LocalForward> {
        const forward = await LocalForward.open(this.client, dstPort, hop, closed => this.forwards.delete(closed));
        this.forwards.add(forward);
        return forward;
    }

    protected async openHop(target: TargetSpec): Promise<Forward> {
        const node = SshEndpoint.parse(target.targetHost, this.options.defaultUser).host;
        if (!RemoteConnection.SAFE_HOST.test(node)) {
            throw new Error(`unsafe or empty compute node name in '${target.targetHost}'`);
        }
        const mid = crypto.randomInt(20_000, 60_000);
        // By bare host name, so the login node's own user and node-to-node trust apply; BatchMode fails fast instead
        // of hanging on a prompt; -v explains a failure in the captured tail.
        const command = 'ssh -v -N -o BatchMode=yes -o ExitOnForwardFailure=yes -o StrictHostKeyChecking=accept-new '
            + `-L 127.0.0.1:${mid}:127.0.0.1:${target.gempbaPort} ${node}`;
        const hop = await this.exec(command);
        const forward = await this.openLocal(mid, hop.channel);
        const deadline = Date.now() + (this.options.forwardReadyTimeoutMs ?? RemoteConnection.DEFAULT_FORWARD_READY_TIMEOUT_MS);
        try {
            while (Date.now() < deadline) {
                if (hop.closed) {
                    throw new Error(`the login node could not reach ${target.targetHost} (inner ssh exited${hop.exitCode !== undefined ? ` code ${hop.exitCode}` : ''})`
                        + suffix(tail(hop.output)));
                }
                if (await carriesData(forward.port)) {
                    return forward;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            throw new Error(`timed out reaching ${target.targetHost}:${target.gempbaPort}; is gempba running there on that port?` + suffix(tail(hop.output)));
        } catch (error) {
            forward.close();
            throw error;
        }
    }

    /** Listens from the exec callback itself: the exit status can arrive in the same packet batch as the reply. */
    protected exec(command: string): Promise<RemoteConnection.Hop> {
        return new Promise((resolve, reject) => this.client.exec(command, { pty: true }, (error, channel) => {
            if (error) {
                reject(new Error(`could not start the hop on ${this.hostLabel}: ${error.message}`));
                return;
            }
            const hop: RemoteConnection.Hop = { channel, output: '', exitCode: undefined, closed: false };
            const collect = (chunk: Buffer) => hop.output = (hop.output + chunk.toString('utf8')).slice(-8192);
            channel.on('data', collect);
            channel.stderr.on('data', collect);
            channel.on('exit', (code: number | null) => hop.exitCode = code ?? undefined);
            channel.on('close', () => hop.closed = true);
            resolve(hop);
        }));
    }
}

export namespace RemoteConnection {
    /** The `ssh -N -L` running on the login node, and what it has said so far. */
    export interface Hop {
        readonly channel: ClientChannel;
        output: string;
        exitCode: number | undefined;
        closed: boolean;
    }
}

/**
 * The authentication order: each identity by publickey, then keyboard-interactive rounds (MFA) for as long as the
 * server allows. Keys and passphrases are read only when their turn comes.
 */
class AuthSequence {

    cancelled = false;
    protected readonly identities: string[];
    protected keyboardRounds = 0;

    constructor(protected readonly username: string, identities: string[], protected readonly prompt: AuthPrompt, protected readonly explicitKey: string) {
        this.identities = [...identities];
    }

    async next(methodsLeft: AuthenticationType[] | null): Promise<AnyAuthMethod | false> {
        const allowed = (method: AuthenticationType) => !methodsLeft || methodsLeft.includes(method);
        while (!this.cancelled && allowed('publickey') && this.identities.length > 0) {
            const key = await this.readKey(this.identities.shift()!);
            if (key) {
                return { type: 'publickey', username: this.username, key };
            }
        }
        if (!this.cancelled && allowed('keyboard-interactive') && this.keyboardRounds < RemoteConnection.MAX_KEYBOARD_ROUNDS) {
            this.keyboardRounds++;
            return {
                type: 'keyboard-interactive',
                username: this.username,
                prompt: (name: string, instructions: string, _lang: string, prompts: Prompt[], finish: KeyboardInteractiveCallback) => {
                    this.answer(name, instructions, prompts).then(finish, () => finish([]));
                }
            };
        }
        return false;
    }

    protected async answer(name: string, instructions: string, prompts: Prompt[]): Promise<string[]> {
        if (prompts.length === 0) {
            return [];
        }
        const answers = await this.prompt.keyboardInteractive(name ?? '', instructions ?? '',
            prompts.map(field => ({ label: field.prompt, echo: field.echo === true })));
        if (!answers) {
            this.cancelled = true;
            return [];
        }
        return answers;
    }

    protected async readKey(file: string): Promise<ParsedKey | undefined> {
        let data: Buffer;
        try {
            data = fs.readFileSync(file);
        } catch (error) {
            if (file === this.explicitKey) {
                throw new Error(`cannot read the SSH key ${file}`);
            }
            return undefined;
        }
        let parsed = firstKey(utils.parseKey(data));
        if (parsed instanceof Error && /passphrase|encrypted/i.test(parsed.message)) {
            const passphrase = await this.prompt.passphrase(file);
            if (!passphrase) {
                return undefined;
            }
            parsed = firstKey(utils.parseKey(data, passphrase));
        }
        return parsed instanceof Error ? undefined : parsed;
    }
}

function firstKey(parsed: ParsedKey | ParsedKey[] | Error): ParsedKey | Error {
    return Array.isArray(parsed) ? parsed[0] : parsed;
}

/** The explicit key first, then whichever default identities exist. */
function identityFiles(explicitKey: string, sshDir: string): string[] {
    const files = explicitKey.trim() === '' ? [] : [explicitKey.trim()];
    for (const name of RemoteConnection.DEFAULT_KEY_NAMES) {
        const file = path.join(sshDir, name);
        if (fs.existsSync(file) && !files.includes(file)) {
            files.push(file);
        }
    }
    return files;
}

/** Whether gempba's telemetry answers through the port: it speaks first, so one byte proves the whole path. */
function carriesData(port: number): Promise<boolean> {
    return new Promise(resolve => {
        const socket = net.createConnection({ host: '127.0.0.1', port });
        const done = (result: boolean) => {
            socket.destroy();
            resolve(result);
        };
        socket.setTimeout(1500, () => done(false));
        socket.once('data', () => done(true));
        socket.once('error', () => done(false));
        socket.once('close', () => done(false));
    });
}

/** The last few non-blank lines of the hop's output, enough to tell which step failed. */
function tail(text: string, maxLines = 4): string {
    return text.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').slice(-maxLines).join(' | ');
}

function suffix(text: string): string {
    return text === '' ? '' : `: ${text}`;
}
