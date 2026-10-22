import { expect } from 'chai';
import { ConnectionMode, DashboardSettings, SessionSpec, TargetSpec } from '@gempba/core';
import { RememberedSettings } from './remembered-settings';

describe('RememberedSettings', () => {

    const defaults = DashboardSettings.defaults();

    it('keeps recents latest first, without duplicates, capped at ten', () => {
        expect(RememberedSettings.recent(['b', 'a'], 'a')).to.deep.equal(['a', 'b']);
        const twelve = Array.from({ length: 12 }, (_, i) => i);
        expect(RememberedSettings.recent(twelve, 99)).to.deep.equal([99, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('remembers a session per mode and makes it the mode to restore', () => {
        const host = RememberedSettings.withSession(defaults, SessionSpec.of({ mode: ConnectionMode.HOST, host: 'me@vm', sshPort: 2222, sshKey: '/k' }));
        expect(host.lastMode).to.equal(ConnectionMode.HOST);
        expect(RememberedSettings.sessionOf(host, ConnectionMode.HOST)).to.deep.equal(SessionSpec.of({ mode: ConnectionMode.HOST, host: 'me@vm', sshPort: 2222, sshKey: '/k' }));

        const jump = RememberedSettings.withSession(host, SessionSpec.of({ mode: ConnectionMode.JUMP, host: 'me@login' }));
        expect(jump.lastMode).to.equal(ConnectionMode.JUMP);
        expect(jump.jump.recentLoginHosts).to.deep.equal(['me@login']);
        expect(jump.host.host).to.equal('me@vm');
        expect(RememberedSettings.withSession(jump, SessionSpec.local()).lastMode).to.equal(ConnectionMode.LOCAL);
    });

    it('remembers a target under the session mode, with its recents', () => {
        const local = RememberedSettings.withTarget(defaults, ConnectionMode.LOCAL, TargetSpec.of(undefined, 9001));
        expect(local.local).to.deep.equal({ gempbaPort: 9001, recentPorts: [9001] });
        expect(RememberedSettings.targetOf(local, ConnectionMode.LOCAL)).to.deep.equal(TargetSpec.of(undefined, 9001));

        const jump = RememberedSettings.withTarget(defaults, ConnectionMode.JUMP, TargetSpec.of('node07', 9100));
        expect(RememberedSettings.targetOf(jump, ConnectionMode.JUMP)).to.deep.equal(TargetSpec.of('node07', 9100));
        expect(jump.jump.recentTargets).to.deep.equal(['node07']);
        expect(jump.local).to.deep.equal(defaults.local);
    });

    it('remembers the rates', () => {
        const rates = RememberedSettings.withRates(defaults, 250, 2000);
        expect([rates.workerIntervalMs, rates.nodeIntervalMs]).to.deep.equal([250, 2000]);
    });
});
