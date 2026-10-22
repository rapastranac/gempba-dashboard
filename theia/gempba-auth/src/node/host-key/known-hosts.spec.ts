import { expect } from 'chai';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuthPrompt } from '../../common/auth-prompt';
import { HostKeyVerifier } from './host-key-verifier';
import { KnownHosts } from './known-hosts';

function sshString(value: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(value.length);
    return Buffer.concat([length, value]);
}

/** A public key blob in SSH wire format. */
function keyBlob(type = 'ssh-ed25519'): Buffer {
    return Buffer.concat([sshString(Buffer.from(type)), sshString(crypto.randomBytes(32))]);
}

function line(hosts: string, key: Buffer, marker = ''): string {
    return `${marker}${marker ? ' ' : ''}${hosts} ${KnownHosts.keyType(key)} ${key.toString('base64')}`;
}

function hashed(token: string): string {
    const salt = crypto.randomBytes(20);
    return `|1|${salt.toString('base64')}|${crypto.createHmac('sha1', salt).update(token).digest('base64')}`;
}

class FakePrompt implements AuthPrompt {
    asked: string[] = [];

    constructor(protected readonly answer: boolean) { }

    async keyboardInteractive(): Promise<string[] | undefined> {
        return undefined;
    }

    async passphrase(): Promise<string | undefined> {
        return undefined;
    }

    async confirmHostKey(host: string, keyType: string, fingerprint: string): Promise<boolean> {
        this.asked.push(`${host} ${keyType} ${fingerprint}`);
        return this.answer;
    }
}

describe('KnownHosts', () => {

    let dir: string;
    let file: string;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-known-hosts-'));
        file = path.join(dir, '.ssh', 'known_hosts');
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    function write(...lines: string[]): KnownHosts {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, lines.join('\n') + '\n');
        return new KnownHosts(file);
    }

    it('names a host bare on port 22 and bracketed otherwise', () => {
        expect(KnownHosts.hostToken('login.cluster', 22)).to.equal('login.cluster');
        expect(KnownHosts.hostToken('127.0.0.1', 2222)).to.equal('[127.0.0.1]:2222');
    });

    it('reads the key type and the SHA256 fingerprint from a key blob', () => {
        const key = keyBlob('ssh-ed25519');
        expect(KnownHosts.keyType(key)).to.equal('ssh-ed25519');
        expect(KnownHosts.fingerprint(key)).to.match(/^SHA256:[A-Za-z0-9+/]{43}$/);
    });

    it('a missing file knows nothing', () => {
        expect(new KnownHosts(file).check('h', 22, keyBlob())).to.equal('unknown');
    });

    it('trusts a listed key, by plain, hashed or pattern host', () => {
        const plain = keyBlob();
        const hash = keyBlob();
        const wildcard = keyBlob();
        const knownHosts = write(line('a.cluster,10.0.0.1', plain), line(hashed('[b.cluster]:2222'), hash), line('*.compute', wildcard));
        expect(knownHosts.check('10.0.0.1', 22, plain)).to.equal('trusted');
        expect(knownHosts.check('b.cluster', 2222, hash)).to.equal('trusted');
        expect(knownHosts.check('node7.compute', 22, wildcard)).to.equal('trusted');
    });

    it('a different key of the same type is a changed key', () => {
        const knownHosts = write(line('a.cluster', keyBlob('ssh-ed25519')));
        expect(knownHosts.check('a.cluster', 22, keyBlob('ssh-ed25519'))).to.equal('changed');
    });

    it('a key of a type not listed for the host is unknown', () => {
        const knownHosts = write(line('a.cluster', keyBlob('ssh-rsa')));
        expect(knownHosts.check('a.cluster', 22, keyBlob('ssh-ed25519'))).to.equal('unknown');
    });

    it('the port matters, negation excludes, and @revoked rejects', () => {
        const key = keyBlob();
        const knownHosts = write(line('a.cluster', key), line('*.cluster,!b.cluster', key), line('c.cluster', key, '@revoked'));
        expect(knownHosts.check('a.cluster', 2222, key)).to.equal('unknown');
        expect(knownHosts.check('b.cluster', 22, key)).to.equal('unknown');
        expect(knownHosts.check('c.cluster', 22, key)).to.equal('changed');
    });

    it('skips comments, blank lines and @cert-authority entries', () => {
        const key = keyBlob();
        const knownHosts = write('# comment', '', line('*', key, '@cert-authority'));
        expect(knownHosts.check('a.cluster', 22, key)).to.equal('unknown');
    });

    it('adds an entry, creating the file and keeping earlier lines', () => {
        const first = keyBlob();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, line('a.cluster', first));
        const knownHosts = new KnownHosts(file);
        const second = keyBlob();
        knownHosts.add('127.0.0.1', 2222, second);
        expect(knownHosts.check('a.cluster', 22, first)).to.equal('trusted');
        expect(knownHosts.check('127.0.0.1', 2222, second)).to.equal('trusted');
        expect(fs.readFileSync(file, 'utf8').split('\n')[1]).to.equal(line('[127.0.0.1]:2222', second));

        const fresh = new KnownHosts(path.join(dir, 'new', 'known_hosts'));
        fresh.add('h', 22, first);
        expect(fresh.check('h', 22, first)).to.equal('trusted');
    });
});

describe('HostKeyVerifier', () => {

    let dir: string;
    let knownHosts: KnownHosts;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-host-key-'));
        knownHosts = new KnownHosts(path.join(dir, 'known_hosts'));
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('asks about an unseen host and remembers the answer', async () => {
        const prompt = new FakePrompt(true);
        const key = keyBlob();
        expect(await new HostKeyVerifier(knownHosts, prompt).verify('127.0.0.1', 2222, key)).to.equal(true);
        expect(prompt.asked).to.deep.equal([`[127.0.0.1]:2222 ssh-ed25519 ${KnownHosts.fingerprint(key)}`]);
        expect(await new HostKeyVerifier(knownHosts, new FakePrompt(false)).verify('127.0.0.1', 2222, key)).to.equal(true);
    });

    it('a rejected host is not remembered', async () => {
        const key = keyBlob();
        expect(await new HostKeyVerifier(knownHosts, new FakePrompt(false)).verify('h', 22, key)).to.equal(false);
        expect(knownHosts.check('h', 22, key)).to.equal('unknown');
    });

    it('refuses a changed key without asking', async () => {
        knownHosts.add('h', 22, keyBlob());
        const prompt = new FakePrompt(true);
        expect(await new HostKeyVerifier(knownHosts, prompt).verify('h', 22, keyBlob())).to.equal(false);
        expect(prompt.asked).to.deep.equal([]);
    });
});
