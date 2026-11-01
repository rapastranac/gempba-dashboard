import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ParsedKey, utils } from 'ssh2';

/**
 * The mock SSH server's keys, kept in `~/.gempba-dashboard/mock/` so its host key stays the same across runs and the
 * dashboard's trust on first use holds. The server never writes `~/.ssh`; it only reads it.
 */
export namespace MockKeys {

    export const HOST_KEY = 'host_ed25519';
    export const CLIENT_KEY = 'client_ed25519';

    export function dir(home = os.homedir()): string {
        return path.join(home, '.gempba-dashboard', 'mock');
    }

    /** The host key, created on first use. */
    export function hostKey(keysDir: string): { readonly privateKey: string, readonly parsed: ParsedKey } {
        const file = path.join(keysDir, HOST_KEY);
        const privateKey = readOrCreate(file);
        return { privateKey, parsed: parse(privateKey) };
    }

    /** The generated client key pair, created on first use: its private file is what the dashboard's key field points at. */
    export function clientKey(keysDir: string): { readonly privatePath: string, readonly parsed: ParsedKey } {
        const privatePath = path.join(keysDir, CLIENT_KEY);
        return { privatePath, parsed: parse(readOrCreate(privatePath)) };
    }

    /** The user's own public keys: every `~/.ssh/*.pub` and each line of `authorized_keys`. */
    export function systemKeys(home = os.homedir()): ParsedKey[] {
        const sshDir = path.join(home, '.ssh');
        let names: string[];
        try {
            names = fs.readdirSync(sshDir);
        } catch {
            return [];
        }
        const lines = names.filter(name => name.endsWith('.pub') || name === 'authorized_keys')
            .flatMap(name => readText(path.join(sshDir, name)).split(/\r?\n/))
            .map(line => line.trim())
            .filter(line => line !== '' && !line.startsWith('#'));
        return lines.map(line => utils.parseKey(line)).filter((key): key is ParsedKey => !(key instanceof Error) && !Array.isArray(key));
    }

    /** OpenSSH's fingerprint: `SHA256:` and the unpadded base64 of the public key's hash. */
    export function fingerprint(key: ParsedKey): string {
        return 'SHA256:' + crypto.createHash('sha256').update(key.getPublicSSH()).digest('base64').replace(/=+$/, '');
    }

    /**
     * The `known_hosts` line that holds another key for the mock's address, plain or hashed, which would make the
     * dashboard refuse the mock; `undefined` when there is none.
     */
    export function knownHostsConflict(port: number, key: ParsedKey, home = os.homedir()): string | undefined {
        const address = port === 22 ? '127.0.0.1' : `[127.0.0.1]:${port}`;
        const ours = key.getPublicSSH().toString('base64');
        for (const line of readText(path.join(home, '.ssh', 'known_hosts')).split(/\r?\n/)) {
            const [hosts, type, blob] = line.trim().split(/\s+/);
            if (!hosts || !blob || hosts.startsWith('#') || hosts.startsWith('@') || type !== key.type) {
                continue;
            }
            if (matches(hosts, address) && blob !== ours) {
                return line.trim();
            }
        }
        return undefined;
    }

    function matches(hosts: string, address: string): boolean {
        if (hosts.startsWith('|1|')) {
            const [, , salt, hash] = hosts.split('|');
            return crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(address).digest('base64') === hash;
        }
        return hosts.split(',').includes(address);
    }

    function readOrCreate(file: string): string {
        if (fs.existsSync(file)) {
            const existing = readText(file);
            if (!(utils.parseKey(existing) instanceof Error)) {
                return existing;
            }
        }
        const pair = generatePair();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, pair.private, { mode: 0o600 });
        fs.writeFileSync(file + '.pub', pair.public + '\n');
        return pair.private;
    }

    /** An ed25519 pair; ssh2's generator emits an unparseable key about once in 150 tries, so those are redrawn. */
    function generatePair(): { private: string, public: string } {
        for (; ;) {
            const pair = utils.generateKeyPairSync('ed25519', { comment: 'gempba-mock' });
            if (!(utils.parseKey(pair.private) instanceof Error)) {
                return pair;
            }
        }
    }

    function parse(privateKey: string): ParsedKey {
        return utils.parseKey(privateKey) as ParsedKey;
    }

    function readText(file: string): string {
        try {
            return fs.readFileSync(file, 'utf8');
        } catch {
            return '';
        }
    }
}
