import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ConnectionMode } from '@gempba/core';
import { MockConfig, MockLive } from '../common/mock-config';
import { MockFault } from '../common/mock-fault';
import { MockLabels } from '../common/mock-labels';
import { MockClient, MockLogLine, MockReach, MockServer, MockStatus } from '../common/mock-protocol';
import { MockRun } from './sim/mock-run';
import { MockTopology } from './sim/mock-topology';
import { MockCenter } from './transport/mock-center';
import { MockKeys } from './transport/mock-keys';
import { MockSshEndpoint } from './transport/ssh-endpoint';
import { MockTcpEndpoint } from './transport/tcp-endpoint';

/**
 * The one mock of the whole app: it starts a run behind the endpoint its mode needs, tells every window its status
 * and log, and remembers the configuration last started in `~/.gempba-dashboard/mock/last-run.json`.
 */
export class MockService implements MockServer {

    static readonly LOG_LINES = 200;
    static readonly LAST_RUN = 'last-run.json';

    protected readonly clients = new Set<MockClient>();
    protected readonly lines: MockLogLine[] = [];
    protected center?: MockCenter;
    protected tcp?: MockTcpEndpoint;
    protected ssh?: MockSshEndpoint;
    protected config?: MockConfig;
    protected reach?: MockReach;
    protected warnings: string[] = [];
    protected ended = false;

    /** `remember` keeps the configuration last started for the next run; the command line leaves it alone. */
    constructor(protected readonly home: string = os.homedir(), protected readonly rememberRuns = true) { }

    addClient(client: MockClient): Disposable {
        this.clients.add(client);
        return Disposable.create(() => this.clients.delete(client));
    }

    async status(): Promise<MockStatus> {
        const run = this.center?.run;
        if (!this.center || !run) {
            return this.ended ? { ...MockStatus.stopped(), ended: true, config: this.config } : MockStatus.stopped();
        }
        return {
            running: true, ended: false, config: this.config, clients: this.center.clients, workerIntervalMs: run.workerIntervalMs,
            nodeIntervalMs: run.nodeIntervalMs, workers: run.topology.workers.length, reach: this.reach, warnings: this.warnings
        };
    }

    async lastConfig(): Promise<MockConfig> {
        try {
            return MockConfig.of(JSON.parse(fs.readFileSync(this.lastRunFile(), 'utf8')));
        } catch {
            return MockConfig.defaults();
        }
    }

    async start(config: MockConfig): Promise<MockStatus> {
        const problems = MockConfig.problems(config);
        if (problems.length > 0) {
            throw new Error(problems.join(' '));
        }
        await this.shutDown();
        this.remember(config);
        this.config = config;
        this.ended = false;
        this.warnings = [];
        const run = new MockRun(MockConfig.shapeOf(config), config.scheduler, config.live, config.seed);
        const center = new MockCenter(run, { log: message => this.log(message), onEnded: () => this.onEnded(), onChange: () => this.publish() });
        this.center = center;
        center.start();
        const { access } = config;
        try {
            if (access.mode === ConnectionMode.LOCAL) {
                this.tcp = new MockTcpEndpoint(center);
                await this.tcp.listen(access.gempbaPort);
                this.reach = { mode: access.mode, gempbaPort: access.gempbaPort };
            } else {
                await this.openSsh(config, center, run);
            }
        } catch (error) {
            await this.shutDown();
            const port = access.mode === ConnectionMode.LOCAL ? access.gempbaPort : access.sshPort;
            const inUse = (error as NodeJS.ErrnoException).code === 'EADDRINUSE';
            throw new Error(inUse ? `Port ${port} is in use: stop whatever listens there, or pick another port.` : `The mock could not start: ${String(error)}`);
        }
        const scheduler = MockLabels.of(MockLabels.SCHEDULERS, config.scheduler).label;
        this.log(`Started: ${MockStatus.summary(await this.status())}; ${scheduler}, ${describe(config.live).join(', ')}, seed ${config.seed}`);
        this.warnings.forEach(warning => this.log(`Warning: ${warning}`));
        this.publish();
        return this.status();
    }

    async stop(): Promise<void> {
        if (!this.center) {
            return;
        }
        await this.shutDown();
        this.ended = false;
        this.log('Stopped');
        this.publish();
    }

    async setLive(live: MockLive): Promise<void> {
        const run = this.center?.run;
        if (!run || !this.config) {
            throw new Error('The mock is not running.');
        }
        const problems = MockConfig.problems({ ...this.config, live });
        if (problems.length > 0) {
            throw new Error(problems.join(' '));
        }
        const before = run.live;
        run.setLive(live);
        this.config = { ...this.config, live };
        this.remember(this.config);
        const changes = describe(live).filter((_, index) => describe(before)[index] !== describe(live)[index]);
        if (changes.length > 0) {
            this.log(`Now ${changes.join(', ')}`);
        }
        this.publish();
    }

    async fault(fault: MockFault): Promise<string> {
        if (!this.center) {
            throw new Error('The mock is not running.');
        }
        const message = this.center.fault(fault);
        this.publish();
        return message;
    }

    async recentLog(): Promise<readonly MockLogLine[]> {
        return [...this.lines];
    }

    protected log(message: string): void {
        const line = { time: Date.now(), message };
        this.lines.push(line);
        if (this.lines.length > MockService.LOG_LINES) {
            this.lines.splice(0, this.lines.length - MockService.LOG_LINES);
        }
        this.clients.forEach(client => client.onLog(line));
    }

    async clearLog(): Promise<void> {
        this.lines.length = 0;
    }

    /** Stops the mock when the app closes, so its ports close with it. */
    dispose(): Promise<void> {
        return this.shutDown();
    }

    protected async openSsh(config: MockConfig, center: MockCenter, run: MockRun): Promise<void> {
        const { access } = config;
        const keysDir = MockKeys.dir(this.home);
        const hostKey = MockKeys.hostKey(keysDir);
        const generated = access.keySource === 'generated' ? MockKeys.clientKey(keysDir) : undefined;
        const authorizedKeys = generated ? [generated.parsed] : MockKeys.systemKeys(this.home);
        if (authorizedKeys.length === 0) {
            this.warnings.push('There is no public key in ~/.ssh, so the mock refuses every sign-in: use a generated key instead.');
        }
        const conflict = MockKeys.knownHostsConflict(access.sshPort, hostKey.parsed, this.home);
        if (conflict) {
            this.warnings.push(`~/.ssh/known_hosts holds another key for [127.0.0.1]:${access.sshPort}, so the dashboard will refuse the mock until that line goes: ${conflict}`);
        }
        const hosts = new Set(run.topology.nodes.map(node => node.host));
        const mode = access.mode as ConnectionMode.HOST | ConnectionMode.JUMP;
        this.ssh = new MockSshEndpoint(center, {
            mode, hostKey: hostKey.privateKey, authorizedKeys, mfaCode: access.mfa ? access.mfaCode.trim() : undefined, gempbaPort: access.gempbaPort,
            isNode: name => hosts.has(name), log: message => this.log(message)
        });
        await this.ssh.listen(access.sshPort);
        this.reach = {
            mode, sshHost: `${os.userInfo().username}@127.0.0.1`, sshPort: access.sshPort, sshKey: generated?.privatePath, gempbaPort: access.gempbaPort,
            targetHost: mode === ConnectionMode.JUMP ? MockTopology.hostName(0) : undefined, hostKeyFingerprint: MockKeys.fingerprint(hostKey.parsed)
        };
    }

    /** gempba's process exited: its port closes, and the status says the run ended. */
    protected onEnded(): void {
        this.shutDown().then(() => {
            this.ended = true;
            this.publish();
        });
    }

    protected async shutDown(): Promise<void> {
        const { center, tcp, ssh } = this;
        this.center = this.tcp = this.ssh = undefined;
        this.reach = undefined;
        center?.stop();
        await Promise.all([tcp?.close(), ssh?.close()]);
    }

    protected publish(): void {
        this.status().then(status => this.clients.forEach(client => client.onStatus(status)));
    }

    protected remember(config: MockConfig): void {
        if (!this.rememberRuns) {
            return;
        }
        try {
            fs.mkdirSync(path.dirname(this.lastRunFile()), { recursive: true });
            fs.writeFileSync(this.lastRunFile(), JSON.stringify(config, undefined, 2));
        } catch {
            // best effort: the mock still runs
        }
    }

    protected lastRunFile(): string {
        return path.join(MockKeys.dir(this.home), MockService.LAST_RUN);
    }
}

/** `Steady, load 85 %, As gempba today`: what the run does, in the panel's words. */
function describe(live: MockLive): string[] {
    return [
        MockLabels.of(MockLabels.SCENARIOS, live.scenario).label,
        `load ${live.loadPct} %`,
        MockLabels.of(MockLabels.FIDELITIES, live.fidelity).label
    ];
}
