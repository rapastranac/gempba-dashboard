import { expect } from 'chai';
import { ConnectionMode } from './connection-mode';
import { SessionSpec } from './session-spec';

describe('SessionSpec', () => {

    it('missing strings and a non-positive port are normalized', () => {
        const spec = SessionSpec.of({ sshPort: 0 });
        expect(spec.mode).to.equal(ConnectionMode.LOCAL);
        expect(spec.host).to.equal('');
        expect(spec.sshPort).to.equal(SessionSpec.DEFAULT_SSH_PORT);
        expect(spec.sshKey).to.equal('');
        expect(spec.authMethod).to.equal(SessionSpec.AuthMethod.SSH_KEY);
    });

    it('the local factory requires no ssh', () => {
        const spec = SessionSpec.local();
        expect(spec.mode).to.equal(ConnectionMode.LOCAL);
        expect(SessionSpec.requiresSsh(spec)).to.be.false;
    });

    it('host and jump require ssh', () => {
        expect(SessionSpec.requiresSsh(SessionSpec.of({ mode: ConnectionMode.HOST, host: 'me@vm' }))).to.be.true;
        expect(SessionSpec.requiresSsh(SessionSpec.of({ mode: ConnectionMode.JUMP, host: 'me@login' }))).to.be.true;
    });

    it('identical fields are equal, so a redundant connect is detectable', () => {
        const a = SessionSpec.of({ mode: ConnectionMode.JUMP, host: 'me@login', sshPort: 22, sshKey: '/k' });
        const b = SessionSpec.of({ mode: ConnectionMode.JUMP, host: 'me@login', sshPort: 22, sshKey: '/k' });
        expect(SessionSpec.equals(a, b)).to.be.true;
        expect(SessionSpec.equals(a, SessionSpec.of({ ...a, sshKey: '/other' }))).to.be.false;
    });
});
