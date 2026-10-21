import { expect } from 'chai';
import { Config } from './config';
import { ConnectionMode } from './connection-mode';
import { DashboardSettings } from './dashboard-settings';
import { RefreshInterval } from './refresh-interval';
import { SessionSpec } from './session-spec';

describe('DashboardSettings', () => {

    it('defaults are LOCAL with the default port and intervals', () => {
        const settings = DashboardSettings.defaults();
        expect(settings.lastMode).to.equal(ConnectionMode.LOCAL);
        expect(settings.local.gempbaPort).to.equal(Config.DEFAULT_PORT);
        expect(settings.workerIntervalMs).to.equal(RefreshInterval.DEFAULT_WORKER_MS);
        expect(settings.nodeIntervalMs).to.equal(RefreshInterval.DEFAULT_NODE_MS);
    });

    it('missing blocks and lists, and non-positive intervals, are normalized', () => {
        const settings = DashboardSettings.of({ workerIntervalMs: 0, nodeIntervalMs: 0 });
        expect(settings.local.recentPorts).to.be.empty;
        expect(settings.host.recentPorts).to.be.empty;
        expect(settings.jump.recentTargets).to.be.empty;
        expect(settings.jump.recentLoginHosts).to.be.empty;
        expect(settings.workerIntervalMs).to.equal(RefreshInterval.DEFAULT_WORKER_MS);
        expect(settings.nodeIntervalMs).to.equal(RefreshInterval.DEFAULT_NODE_MS);
    });

    it('recent lists are defensively copied', () => {
        const recentTargets = ['me@fc1', 'me@fc2'];
        const recentLoginHosts = ['me@login1', 'me@login2'];
        const jump = DashboardSettings.jumpOf({ loginHost: 'me@login', targetHost: 'me@fc1', recentTargets, recentLoginHosts });
        recentTargets.push('x');
        recentLoginHosts.push('x');
        expect(jump.recentTargets).to.deep.equal(['me@fc1', 'me@fc2']);
        expect(jump.recentLoginHosts).to.deep.equal(['me@login1', 'me@login2']);
    });

    it('per-mode blocks default to the default ports', () => {
        expect(DashboardSettings.hostOf({}).gempbaPort).to.equal(Config.DEFAULT_PORT);
        expect(DashboardSettings.jumpOf({}).gempbaPort).to.equal(Config.DEFAULT_PORT);
        expect(DashboardSettings.hostOf({}).sshPort).to.equal(SessionSpec.DEFAULT_SSH_PORT);
    });
});
