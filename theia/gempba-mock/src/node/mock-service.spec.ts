import { expect } from 'chai';
import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { ConnectionMode } from '@gempba/core';
import { MockConfig } from '../common/mock-config';
import { MockLogLine, MockStatus } from '../common/mock-protocol';
import { MockService } from './mock-service';

function freePort(): Promise<number> {
    return new Promise(resolve => {
        const server = net.createServer();
        server.listen(0, '127.0.0.1', () => {
            const port = (server.address() as net.AddressInfo).port;
            server.close(() => resolve(port));
        });
    });
}

function firstLine(port: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const socket = net.createConnection(port, '127.0.0.1');
        let buffered = '';
        socket.on('data', chunk => {
            buffered += chunk.toString();
            if (buffered.includes('\n')) {
                socket.destroy();
                resolve(buffered.slice(0, buffered.indexOf('\n')));
            }
        });
        socket.on('error', reject);
    });
}

describe('MockService', () => {

    let home: string;
    let service: MockService;
    let statuses: MockStatus[];
    let lines: MockLogLine[];

    function config(overrides: Partial<MockConfig['access']> = {}): MockConfig {
        const defaults = MockConfig.defaults();
        return { ...defaults, access: { ...defaults.access, ...overrides } };
    }

    beforeEach(() => {
        home = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-mock-service-'));
        service = new MockService(home);
        statuses = [];
        lines = [];
        service.addClient({ onStatus: status => statuses.push(status), onLog: line => lines.push(line) });
    });

    afterEach(async () => {
        await service.dispose();
        fs.rmSync(home, { recursive: true, force: true });
    });

    it('starts a Local mock that streams on its port, tells every window, and remembers what it started', async () => {
        const port = await freePort();
        const status = await service.start(config({ gempbaPort: port }));
        expect(status).to.deep.include({ running: true, ended: false, clients: 0, ranks: 4, reach: { mode: ConnectionMode.LOCAL, gempbaPort: port } });
        expect(JSON.parse(await firstLine(port)).nodes).to.have.lengthOf(1);
        expect(lines[0].message).to.equal(`Started: Running · Local on 127.0.0.1:${port} · 1 node, 4 ranks · 0 clients; `
            + 'Semi-centralized, Steady, load 85 %, As gempba today, seed 42');
        expect(statuses.at(-1)!.running).to.equal(true);
        expect((await service.lastConfig()).access.gempbaPort).to.equal(port);
        await service.stop();
        expect(await service.status()).to.deep.equal(MockStatus.stopped());
        expect(lines.at(-1)!.message).to.equal('Stopped');
    });

    it('leaves the last configuration alone when told not to remember runs, as the command line does', async () => {
        const quiet = new MockService(home, false);
        await quiet.start(config({ gempbaPort: await freePort() }));
        await quiet.dispose();
        expect(fs.existsSync(path.join(home, '.gempba-dashboard', 'mock', MockService.LAST_RUN))).to.equal(false);
        expect(await quiet.lastConfig()).to.deep.equal(MockConfig.defaults());
    });

    it('refuses what cannot run, and a port already in use', async () => {
        let refused: unknown;
        await service.start(config({ gempbaPort: 0 })).catch(error => refused = error);
        expect(String(refused)).to.contain('The gempba port must be a whole number from 1 to 65535.');
        const port = await freePort();
        const squatter = net.createServer().listen(port, '127.0.0.1');
        await new Promise(resolve => squatter.once('listening', resolve));
        refused = undefined;
        await service.start(config({ gempbaPort: port })).catch(error => refused = error);
        squatter.close();
        expect(String(refused)).to.contain(`Port ${port} is in use`);
        expect((await service.status()).running).to.equal(false);
    });

    it('changes the run live, and closes its port when the run ends', async () => {
        const port = await freePort();
        const started = await service.start(config({ gempbaPort: port }));
        await service.setLive({ ...started.config!.live, scenario: 'slow', loadPct: 40 });
        expect((await service.status()).config!.live).to.include({ scenario: 'slow', loadPct: 40 });
        expect(lines.at(-1)!.message).to.equal('Now Slow tasks, load 40 %');
        expect((await service.lastConfig()).live.scenario).to.equal('slow');
        expect(await service.fault('end-run')).to.equal('Ended the run, as when gempba\'s process exits');
        await new Promise(resolve => setTimeout(resolve, 50));
        expect(await service.status()).to.include({ running: false, ended: true });
        let refused: unknown;
        await firstLine(port).catch(error => refused = error);
        expect((refused as NodeJS.ErrnoException).code).to.equal('ECONNREFUSED');
    });

    it('serves SSH with a generated key, and warns when no key would be accepted', async () => {
        const status = await service.start(config({ mode: ConnectionMode.JUMP, sshPort: await freePort(), keySource: 'generated' }));
        expect(status.reach).to.deep.include({ mode: ConnectionMode.JUMP, targetHost: 'mock-host-01', sshKey: path.join(home, '.gempba-dashboard', 'mock', 'client_ed25519') });
        expect(status.reach!.hostKeyFingerprint).to.match(/^SHA256:/);
        expect(status.ranks, 'Jump reaches the cluster: 2 nodes of 4 ranks').to.equal(8);
        expect(status.warnings).to.deep.equal([]);
        const system = await service.start(config({ mode: ConnectionMode.HOST, sshPort: await freePort(), keySource: 'system' }));
        expect(system.warnings[0]).to.contain('no public key in ~/.ssh');
        expect(system.reach!.sshKey).to.equal(undefined);
        expect(system.ranks, 'Host is one VM').to.equal(4);
    });

    it('keeps the last 200 log lines', async () => {
        await service.start(config({ gempbaPort: await freePort() }));
        for (let i = 0; i < 250; i++) {
            await service.fault('malformed-line');
        }
        const log = await service.recentLog();
        expect(log).to.have.lengthOf(200);
        expect(log.every(line => line.message === 'Sent a malformed line')).to.equal(true);
        await service.clearLog();
        expect(await service.recentLog()).to.deep.equal([]);
    });
});
