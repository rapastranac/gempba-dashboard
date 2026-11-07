import { expect } from 'chai';
import { SshEndpoint } from './ssh-endpoint';

describe('SshEndpoint', () => {

    it('parses user and host with the default port', () => {
        expect(SshEndpoint.parse('user@login.cluster.edu', 'os-user'))
            .to.deep.equal({ user: 'user', host: 'login.cluster.edu', port: SshEndpoint.DEFAULT_PORT });
    });

    it('parses an explicit port', () => {
        expect(SshEndpoint.parse('me@vm:2222', 'os-user')).to.deep.equal({ user: 'me', host: 'vm', port: 2222 });
    });

    it('a missing user falls back to the default user', () => {
        expect(SshEndpoint.parse('just-a-host', 'os-user'))
            .to.deep.equal({ user: 'os-user', host: 'just-a-host', port: SshEndpoint.DEFAULT_PORT });
    });

    it('a non-numeric port is treated as part of the host', () => {
        const endpoint = SshEndpoint.parse('me@vm:notaport', 'os-user');
        expect(endpoint.host).to.equal('vm:notaport');
        expect(endpoint.port).to.equal(SshEndpoint.DEFAULT_PORT);
    });

    it('a blank spec is handled', () => {
        const endpoint = SshEndpoint.parse('  ', 'os-user');
        expect(endpoint.host).to.equal('');
        expect(endpoint.port).to.equal(SshEndpoint.DEFAULT_PORT);
    });
});
