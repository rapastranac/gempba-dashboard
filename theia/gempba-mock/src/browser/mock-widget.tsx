import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { MessageService } from '@theia/core/lib/common/message-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ConnectionMode } from '@gempba/core';
import { MockConfig, MockLive, MockShape } from '../common/mock-config';
import { MockDraft } from '../common/mock-draft';
import { MockFault } from '../common/mock-fault';
import { MockChoice, MockLabels } from '../common/mock-labels';
import { MockStatus } from '../common/mock-protocol';
import { MockController } from './mock-controller';

/** Load slider moves reach the mock this long after the last one, not on every pixel. */
const LOAD_SETTLE_MS = 250;

/**
 * The Mock panel: how the dashboard reaches the mock, the cluster it imitates and its scheduler, fixed while it runs;
 * what the run does, which changes it live; faults to inject; and the mock's log. Connect points this window at the running mock.
 */
@injectable()
export class MockWidget extends ReactWidget {

    static readonly ID = 'gempba-mock';
    static readonly LABEL = 'Mock';

    @inject(MockController) protected readonly mock: MockController;
    @inject(MessageService) protected readonly messages: MessageService;

    protected draft = MockDraft.of(MockConfig.defaults());
    protected problem = '';
    protected loadTimer: number | undefined;

    @postConstruct()
    protected init(): void {
        this.id = MockWidget.ID;
        this.title.label = MockWidget.LABEL;
        this.title.caption = 'GemPBA built-in mocker';
        this.title.iconClass = codicon('beaker');
        this.title.closable = true;
        this.addClass('gempba-mock');
        this.toDispose.push(this.mock.onStatus(status => this.follow(status)));
        this.toDispose.push(this.mock.onLog(() => this.update()));
        this.mock.lastConfig().then(config => {
            if (!this.mock.status.running) {
                this.draft = MockDraft.of(config);
            }
            this.follow(this.mock.status);
        });
    }

    /** A running mock's configuration is the truth: it may have been started from another window or the palette. */
    protected follow(status: MockStatus): void {
        if (status.running && status.config) {
            this.draft = MockDraft.of(status.config);
        }
        this.update();
    }

    protected render(): React.ReactNode {
        const status = this.mock.status;
        const running = status.running;
        const ssh = this.draft.mode !== ConnectionMode.LOCAL;
        return <div className='gempba-mock-form'>
            <section>
                <p className='gempba-mock-state'>{MockStatus.summary(status)}</p>
                {status.warnings.map(warning => <p key={warning} className='gempba-mock-warning'>{warning}</p>)}
                <div className='gempba-mock-row'>
                    {running
                        ? <button className='theia-button secondary' onClick={() => this.run(this.mock.stop())}>Stop</button>
                        : <button className='theia-button' onClick={() => this.start()}>Start</button>}
                    {this.mock.connected
                        ? <button className='theia-button secondary' onClick={() => this.run(this.mock.disconnect())}>Disconnect this window</button>
                        : <button className='theia-button' disabled={!running} onClick={() => this.run(this.mock.connect())}>Connect this window</button>}
                </div>
                {running && status.reach && this.renderReach(status)}
            </section>
            <section>
                <h3>Access</h3>
                {this.select('Mode', MockLabels.MODES, this.draft.mode, running, mode => this.edit({ mode }))}
                {this.field('gempba port', this.draft.gempbaPort, running, gempbaPort => this.edit({ gempbaPort }))}
                {ssh && <>
                    {this.field('SSH port', this.draft.sshPort, running, sshPort => this.edit({ sshPort }))}
                    {this.select('Accepted keys', MockLabels.KEY_SOURCES, this.draft.keySource, running, keySource => this.edit({ keySource }))}
                    <label className='gempba-mock-check'>
                        <input type='checkbox' checked={this.draft.mfa} disabled={running} onChange={e => this.edit({ mfa: e.target.checked })} />
                        MFA after the key
                    </label>
                    {this.draft.mfa && this.field('Passcode', this.draft.mfaCode, running, mfaCode => this.edit({ mfaCode }), { numeric: false })}
                </>}
            </section>
            <section>
                <h3>Cluster</h3>
                {this.select('Scheduler', MockLabels.SCHEDULERS, this.draft.scheduler, running, scheduler => this.edit({ scheduler }))}
                {this.field('Coordinator on rank', this.draft.coordinatorRank, running, coordinatorRank => this.edit({ coordinatorRank }),
                    { hint: 'The rank the scheduler\'s coordinator runs on: 0, as gempba\'s schedulers put it, or another, as other schedulers may; every other rank runs tasks' })}
                {this.draft.mode !== ConnectionMode.JUMP
                    && <p className='gempba-mock-hint'>One node: {this.draft.mode === ConnectionMode.LOCAL ? 'this machine' : 'the VM'}. Jump reaches a cluster.</p>}
                {(Object.keys(MockConfig.SHAPE_BOUNDS) as MockShape.Count[]).filter(key => key !== 'nodes' || this.draft.mode === ConnectionMode.JUMP)
                    .map(key => <React.Fragment key={key}>
                        {this.field(COUNTS[key].label, this.draft.counts[key], running, value => this.edit({ counts: { ...this.draft.counts, [key]: value } }),
                            { hint: COUNTS[key].hint })}
                    </React.Fragment>)}
                {this.field('Seed', this.draft.seed, running, seed => this.edit({ seed }), { hint: 'The same seed and cluster give the same run' })}
                <label className='gempba-mock-check'>
                    <input type='checkbox' checked={this.draft.smt} disabled={running} onChange={e => this.edit({ smt: e.target.checked })} />
                    SMT, two threads per core
                </label>
            </section>
            <section>
                <h3>Behaviour</h3>
                {this.select('Scenario', MockLabels.SCENARIOS, this.draft.live.scenario, false, scenario => this.live({ scenario }))}
                <label>Load: {this.draft.live.loadPct} %
                    <input type='range' min={0} max={100} value={this.draft.live.loadPct} onChange={e => this.live({ loadPct: Number(e.target.value) }, LOAD_SETTLE_MS)} />
                </label>
                {this.select('Fidelity', MockLabels.FIDELITIES, this.draft.live.fidelity, false, fidelity => this.live({ fidelity }))}
            </section>
            <section>
                <h3>Faults</h3>
                <div className='gempba-mock-faults'>
                    {MockFault.ALL.map(fault => <button key={fault} className='theia-button secondary' disabled={!running}
                        onClick={() => this.run(this.mock.fault(fault).then(() => undefined))}>{MockFault.label(fault)}</button>)}
                </div>
            </section>
            <section>
                <h3 className='gempba-mock-row'>Log
                    <button className='theia-button secondary' onClick={() => this.run(this.mock.clearLog())}>Clear</button>
                </h3>
                <ol className='gempba-mock-log'>
                    {[...this.mock.log].reverse().map((line, index) => <li key={`${line.time}-${index}`}>
                        <span className='gempba-mock-log-time'>{new Date(line.time).toLocaleTimeString()}</span> {line.message}
                    </li>)}
                </ol>
            </section>
            {this.problem && <p className='gempba-mock-problem'>{this.problem}</p>}
        </div>;
    }

    /** What to type into the Connection view, for reaching the mock by hand. */
    protected renderReach(status: MockStatus): React.ReactNode {
        const reach = status.reach!;
        const rows: [string, string | undefined][] = [
            ['Mode', MockLabels.of(MockLabels.MODES, reach.mode).label],
            [reach.mode === ConnectionMode.JUMP ? 'Login node' : 'Host', reach.sshHost],
            ['SSH port', reach.sshPort?.toString()],
            ['Key', reach.mode === ConnectionMode.LOCAL ? undefined : reach.sshKey ?? 'your default keys in ~/.ssh'],
            ['Compute node', reach.targetHost],
            ['gempba port', String(reach.gempbaPort)],
            ['Passcode', status.config?.access.mfa && reach.mode !== ConnectionMode.LOCAL ? status.config.access.mfaCode : undefined],
            ['Host key', reach.hostKeyFingerprint]
        ];
        return <dl className='gempba-mock-reach'>
            {rows.filter(([, value]) => value !== undefined).map(([label, value]) => <React.Fragment key={label}>
                <dt>{label}</dt><dd title={value}>{value}</dd>
            </React.Fragment>)}
        </dl>;
    }

    protected select<T extends string>(label: string, choices: readonly MockChoice<T>[], value: T, disabled: boolean, change: (value: T) => void): React.ReactNode {
        return <label title={MockLabels.of(choices, value).detail}>{label}
            <select className='theia-select' value={value} disabled={disabled} onChange={e => change(e.target.value as T)}>
                {choices.map(choice => <option key={choice.value} value={choice.value} title={choice.detail}>{choice.label}</option>)}
            </select>
        </label>;
    }

    /** A label and a compact box on one row, so the boxes line up in one column; a hint shows on hover. */
    protected field(label: string, value: string, disabled: boolean, change: (value: string) => void,
        options: { readonly numeric?: boolean, readonly hint?: string } = {}): React.ReactNode {
        const numeric = options.numeric ?? true;
        return <label className={`gempba-mock-field${numeric ? ' gempba-mock-number' : ''}`} title={options.hint}>
            <span>{label}</span>
            <input className='theia-input' inputMode={numeric ? 'numeric' : undefined} value={value} disabled={disabled}
                onChange={e => change(numeric ? e.target.value.replace(/[^\d]/g, '') : e.target.value)} />
        </label>;
    }

    protected edit(change: Partial<MockDraft>): void {
        this.draft = { ...this.draft, ...change };
        this.problem = '';
        this.update();
    }

    /** Behaviour changes reach a running mock at once, a load drag once it settles; a stopped mock starts with them. */
    protected live(change: Partial<MockLive>, settleMs = 0): void {
        const live = { ...this.draft.live, ...change };
        this.edit({ live });
        if (!this.mock.status.running) {
            return;
        }
        window.clearTimeout(this.loadTimer);
        this.loadTimer = window.setTimeout(() => this.run(this.mock.setLive(live)), settleMs);
    }

    protected async start(): Promise<void> {
        const config = MockDraft.toConfig(this.draft);
        const problems = MockConfig.problems(config);
        if (problems.length > 0) {
            this.problem = problems.join(' ');
            this.update();
            return;
        }
        await this.run(this.mock.start(config).then(() => undefined));
    }

    protected async run(action: Promise<void>): Promise<void> {
        try {
            await action;
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }
}

const COUNTS: { readonly [K in MockShape.Count]: { readonly label: string, readonly hint?: string } } = {
    nodes: { label: 'Nodes', hint: 'Compute nodes behind the login node' },
    socketsPerNode: { label: 'Sockets per node' },
    coresPerSocket: { label: 'Cores per socket', hint: 'Physical cores; SMT doubles the logical CPUs' },
    ranksPerNode: { label: 'Ranks per node', hint: 'gempba processes, one MPI rank each; rank 0 is the coordinator' },
    poolThreads: { label: 'Pool threads', hint: '0 gives each rank one thread per CPU it may use' },
    memPerNodeGiB: { label: 'Memory (GiB)', hint: 'The memory of each node' },
    cgroupGiB: { label: 'Cgroup (GiB)', hint: 'The job\'s memory-cgroup limit on each node; 0 runs outside a memory cgroup' }
};
