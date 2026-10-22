import { AuthPrompt } from '../../common/auth-prompt';
import { KnownHosts } from './known-hosts';

/**
 * Trust on first use, like OpenSSH's `StrictHostKeyChecking=ask`: a known key passes, a changed key is refused
 * without asking (a possible man in the middle), and an unseen host is shown to the user and remembered once trusted.
 */
export class HostKeyVerifier {

    constructor(protected readonly knownHosts: KnownHosts, protected readonly prompt: AuthPrompt) { }

    async verify(host: string, port: number, key: Buffer): Promise<boolean> {
        const status = this.knownHosts.check(host, port, key);
        if (status !== 'unknown') {
            return status === 'trusted';
        }
        const trusted = await this.prompt.confirmHostKey(KnownHosts.hostToken(host, port), KnownHosts.keyType(key), KnownHosts.fingerprint(key));
        if (trusted) {
            this.knownHosts.add(host, port, key);
        }
        return trusted === true;
    }
}
