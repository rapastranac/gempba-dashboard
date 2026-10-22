import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConnectionMode, DashboardSettings } from '@gempba/core';
import { SettingsStore } from './settings-store';

describe('SettingsStore', () => {

    let dir: string;

    beforeEach(() => dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-settings-')));
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it('round-trips settings', () => {
        const store = new SettingsStore(path.join(dir, 'settings.json'));
        const original = DashboardSettings.of({
            lastMode: ConnectionMode.JUMP,
            local: { gempbaPort: 9001, recentPorts: [9001, 9002] },
            host: { host: 'me@vm', sshPort: 22, sshKey: '/keys/id', gempbaPort: 9100, recentPorts: [9100] },
            jump: {
                loginHost: 'me@login', sshPort: 22, sshKey: '', targetHost: 'me@node01', gempbaPort: 9000,
                recentTargets: ['me@node01', 'me@node02'], recentLoginHosts: ['me@login', 'me@login2']
            },
            workerIntervalMs: 250,
            nodeIntervalMs: 750
        });
        store.save(original);
        expect(store.load()).to.deep.equal(original);
    });

    it('a missing file loads the defaults', () => {
        expect(new SettingsStore(path.join(dir, 'does-not-exist.json')).load()).to.deep.equal(DashboardSettings.defaults());
    });

    it('a corrupt file loads the defaults and is set aside', () => {
        const file = path.join(dir, 'settings.json');
        fs.writeFileSync(file, '{ this is not valid json ');
        expect(new SettingsStore(file).load()).to.deep.equal(DashboardSettings.defaults());
        expect(fs.existsSync(file)).to.equal(false);
        expect(fs.existsSync(`${file}.corrupt`)).to.equal(true);
    });

    it('saving creates missing parent directories', () => {
        const nested = path.join(dir, 'a', 'b', 'settings.json');
        new SettingsStore(nested).save(DashboardSettings.defaults());
        expect(fs.existsSync(nested)).to.equal(true);
    });

    it('loads older settings without recentLoginHosts, and an unknown mode as LOCAL', () => {
        const file = path.join(dir, 'settings.json');
        fs.writeFileSync(file, JSON.stringify({
            lastMode: 'JUMP',
            local: { gempbaPort: 9001, recentPorts: [9001] },
            host: { host: 'me@vm', sshPort: 22, sshKey: '', gempbaPort: 9100, recentPorts: [] },
            jump: { loginHost: 'me@login', sshPort: 22, sshKey: '', targetHost: 'me@node01', gempbaPort: 9000, recentTargets: ['me@node01', 'me@node02'] },
            workerIntervalMs: 250,
            nodeIntervalMs: 750
        }));
        const loaded = new SettingsStore(file).load();
        expect(loaded.jump.recentLoginHosts).to.deep.equal([]);
        expect(loaded.jump.loginHost).to.equal('me@login');

        fs.writeFileSync(file, JSON.stringify({ lastMode: 'SERIAL' }));
        expect(new SettingsStore(file).load().lastMode).to.equal(ConnectionMode.LOCAL);
    });
});
