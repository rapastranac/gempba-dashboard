import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * An OpenSSH known_hosts file (the system ssh client's own, by default), read on every check so keys accepted
 * elsewhere are honoured. Understands hashed host names, `[host]:port` entries, `*`/`?` patterns, negation and
 * `@revoked`; `@cert-authority` lines are ignored.
 */
export class KnownHosts {

    constructor(readonly file: string) { }

    /**
     * `trusted` when an entry holds this key; `changed` when the host is known with another key of the same type
     * (or this key is revoked); `unknown` otherwise.
     */
    check(host: string, port: number, key: Buffer): KnownHosts.Status {
        const token = KnownHosts.hostToken(host, port);
        const matching = this.entries().filter(entry => matchesHost(entry.hosts, token));
        if (matching.some(entry => entry.marker === '@revoked' && entry.key.equals(key))) {
            return 'changed';
        }
        const listed = matching.filter(entry => entry.marker !== '@revoked');
        if (listed.some(entry => entry.key.equals(key))) {
            return 'trusted';
        }
        const type = KnownHosts.keyType(key);
        return listed.some(entry => entry.type === type) ? 'changed' : 'unknown';
    }

    add(host: string, port: number, key: Buffer): void {
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        const existing = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8') : '';
        const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
        const line = `${KnownHosts.hostToken(host, port)} ${KnownHosts.keyType(key)} ${key.toString('base64')}\n`;
        fs.appendFileSync(this.file, separator + line, { mode: 0o600 });
    }

    protected entries(): KnownHosts.Entry[] {
        if (!fs.existsSync(this.file)) {
            return [];
        }
        const entries: KnownHosts.Entry[] = [];
        for (const raw of fs.readFileSync(this.file, 'utf8').split('\n')) {
            const fields = raw.trim().split(/\s+/);
            if (fields[0] === '' || fields[0].startsWith('#')) {
                continue;
            }
            const marker = fields[0].startsWith('@') ? fields.shift() : undefined;
            if (marker === '@cert-authority' || fields.length < 3) {
                continue;
            }
            entries.push({ marker, hosts: fields[0].split(','), type: fields[1], key: Buffer.from(fields[2], 'base64') });
        }
        return entries;
    }
}

export namespace KnownHosts {

    export type Status = 'trusted' | 'unknown' | 'changed';

    export interface Entry {
        readonly marker: string | undefined;
        readonly hosts: string[];
        readonly type: string;
        readonly key: Buffer;
    }

    /** How OpenSSH names a host: bare on port 22, `[host]:port` otherwise. */
    export function hostToken(host: string, port: number): string {
        return port === 22 ? host : `[${host}]:${port}`;
    }

    /** The algorithm name at the start of an SSH public key blob, e.g. `ssh-ed25519`. */
    export function keyType(key: Buffer): string {
        const length = key.length >= 4 ? key.readUInt32BE(0) : 0;
        return key.subarray(4, 4 + length).toString('latin1');
    }

    /** `SHA256:` plus the unpadded base64 digest, as `ssh-keygen -l` prints it. */
    export function fingerprint(key: Buffer): string {
        return 'SHA256:' + crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '');
    }
}

function matchesHost(patterns: string[], token: string): boolean {
    let matched = false;
    for (const pattern of patterns) {
        if (pattern.startsWith('|1|')) {
            matched ||= matchesHashed(pattern, token);
        } else if (pattern.startsWith('!')) {
            if (glob(pattern.slice(1), token)) {
                return false;
            }
        } else {
            matched ||= glob(pattern, token);
        }
    }
    return matched;
}

function matchesHashed(pattern: string, token: string): boolean {
    const [, , salt, hash] = pattern.split('|');
    if (!salt || !hash) {
        return false;
    }
    return crypto.createHmac('sha1', Buffer.from(salt, 'base64')).update(token).digest('base64') === hash;
}

function glob(pattern: string, token: string): boolean {
    const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp(`^${source}$`, 'i').test(token);
}
