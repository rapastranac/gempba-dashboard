import { MessageService } from '@theia/core/lib/common/message-service';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import {
    ConnectionMode, ConnectionState, DashboardSettings, RefreshInterval, SessionSpec, StreamCondition, TargetSpec
} from '@gempba/core';
import { ObservedIntervals, RankHistoryService, RunControl, StatusText, TelemetryService } from '@gempba/telemetry/lib/common';
import { LiveIndicator, Panel, SegmentedControl, SegmentedOption, VisibleRefresh } from '@gempba/ui/lib/browser';
import { Liveness } from '@gempba/ui/lib/common/liveness';
import { RememberedSettings } from '../common/remembered-settings';
import { SettingsServer } from '../common/settings-protocol';
import { RememberedRatesMove } from './remembered-rates-move';

/** The arrows of a rate field move by this much; gempba itself takes any value between its bounds. */
const RATE_STEP_MS = 50;

const MODES: Record<ConnectionMode, SegmentedOption<ConnectionMode>> = {
    [ConnectionMode.LOCAL]: { value: ConnectionMode.LOCAL, label: 'Local', title: 'gempba on this machine' },
    [ConnectionMode.HOST]: { value: ConnectionMode.HOST, label: 'Host', title: 'A VM over SSH' },
    [ConnectionMode.JUMP]: { value: ConnectionMode.JUMP, label: 'Jump host', title: 'A compute node through a login node' }
};

/** The dot beside the stream's words: live, paused, run ended, reconnecting or waiting for a first frame, or not streaming. */
const TONES: Record<StreamCondition, Liveness> = {
    live: 'live', paused: 'paused', ended: 'ended', reconnecting: 'stale', stopped: 'off', disconnected: 'off', lost: 'off'
};

interface Form {
    host: string;
    sshPort: string;
    sshKey: string;
    targetHost: string;
    gempbaPort: string;
    intervalMs: string;
    label: string;
}

interface IconButtonProps {
    readonly icon: string;
    readonly label: string;
    readonly primary?: boolean;
    readonly disabled?: boolean;
    readonly onClick: () => void;
}

function IconButton({ icon, label, primary, disabled, onClick }: IconButtonProps): React.ReactElement {
    return <button type='button' className={primary ? 'theia-button' : 'theia-button secondary'} disabled={disabled} onClick={onClick}>
        <span className={`codicon codicon-${icon}`} aria-hidden={true} />
        {label}
    </button>;
}

/**
 * The connection controls under the stream's state: the session (mode, host, key) and the target (compute node, port),
 * pre-filled from the remembered settings and never connecting on its own; the refresh rate, which the hub keeps as a
 * setting; and the run controls. Only the SSH modes have a session to connect; a local gempba is listened to directly.
 * It only drives TelemetryService, so the palette commands keep working without it.
 */
@injectable()
export class ConnectionWidget extends ReactWidget {

    static readonly ID = 'gempba-connection';
    static readonly LABEL = 'Connection';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(RankHistoryService) protected readonly rankHistory: RankHistoryService;
    @inject(SettingsServer) protected readonly settingsServer: SettingsServer;
    @inject(FileDialogService) protected readonly fileDialog: FileDialogService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(RememberedRatesMove) protected readonly ratesMove: RememberedRatesMove;

    protected settings = DashboardSettings.defaults();
    protected modes: ConnectionMode[] = [ConnectionMode.LOCAL];
    protected mode = ConnectionMode.LOCAL;
    /** The mode of the session this view opened; the target fields follow it. */
    protected sessionMode = ConnectionMode.LOCAL;
    /** Field initializers run before injection, so the rate starts at its default until the remembered settings are restored. */
    protected form: Form = this.formOf(this.settings, this.mode, RefreshInterval.DEFAULT_MS);
    protected problem = '';

    @postConstruct()
    protected init(): void {
        this.id = ConnectionWidget.ID;
        this.title.label = ConnectionWidget.LABEL;
        this.title.caption = 'GemPBA connection';
        this.title.iconClass = codicon('plug');
        this.title.closable = false;
        this.addClass('gempba-connection');
        // The header follows every snapshot; a hidden view (a collapsed side panel) draws nothing until it is shown.
        const refresh = new VisibleRefresh(this, () => this.update());
        this.toDispose.push(refresh);
        this.toDispose.push(this.telemetry.onStateChange(() => refresh.request()));
        this.toDispose.push(this.telemetry.onStatus(() => refresh.request()));
        this.toDispose.push(this.telemetry.onSnapshot(() => refresh.request()));
        this.toDispose.push(this.telemetry.onLinkChange(() => refresh.request()));
        this.toDispose.push(this.telemetry.onClear(() => refresh.request()));
        this.toDispose.push(this.telemetry.onIntervalChange(intervalMs => this.showInterval(intervalMs)));
        this.restore();
    }

    protected async restore(): Promise<void> {
        await this.ratesMove.moved();
        const [settings, modes] = await Promise.all([this.settingsServer.load(), this.telemetry.availableModes()]);
        this.settings = settings;
        this.modes = modes;
        this.mode = this.sessionMode = modes.includes(settings.lastMode) ? settings.lastMode : ConnectionMode.LOCAL;
        this.form = this.formOf(settings, this.mode, this.telemetry.intervalMs);
        this.update();
    }

    protected formOf(settings: DashboardSettings, mode: ConnectionMode, intervalMs: number): Form {
        const session = RememberedSettings.sessionOf(settings, mode);
        const target = RememberedSettings.targetOf(settings, mode);
        return {
            host: session.host,
            sshPort: String(session.sshPort),
            sshKey: session.sshKey,
            targetHost: target.targetHost,
            gempbaPort: String(target.gempbaPort),
            intervalMs: String(intervalMs),
            label: this.form?.label ?? ''
        };
    }

    /** A rate changed anywhere (a view's controls, the Settings page, another window) replaces the one typed here. */
    protected showInterval(intervalMs: number): void {
        this.form = { ...this.form, intervalMs: String(intervalMs) };
        this.update();
    }

    protected render(): React.ReactNode {
        return <div className='gempba-connection-form'>
            {this.renderHeader()}
            {this.problem && <p className='gempba-connection-problem' role='alert'>{this.problem}</p>}
            {this.renderSession()}
            {this.renderTarget()}
            {this.renderRate()}
            {this.renderRun()}
            <datalist id='gempba-recent-ports'>{this.recentPorts().map(port => <option key={port} value={port} />)}</datalist>
            <datalist id='gempba-recent-targets'>{this.settings.jump.recentTargets.map(node => <option key={node} value={node} />)}</datalist>
            <datalist id='gempba-recent-login-hosts'>{this.settings.jump.recentLoginHosts.map(host => <option key={host} value={host} />)}</datalist>
        </div>;
    }

    /** The stream's state as the status bar words it, with the hub's latest status line under it. */
    protected renderHeader(): React.ReactNode {
        const { state, condition, status } = this.telemetry;
        const snapshot = this.telemetry.snapshot;
        const summary = StatusText.summary({
            state, condition, status, nodes: snapshot?.nodes.length, throughput: this.rankHistory.clusterThroughput().at(-1),
            intervalMs: this.telemetry.intervalMs, observed: this.telemetry.observedIntervals, run: snapshot?.run, lastFrameAt: this.telemetry.lastFrameAt
        });
        const tone: Liveness = condition ? TONES[condition] : state === ConnectionState.LISTENING ? 'stale' : 'off';
        return <header className='gempba-connection-header'>
            <LiveIndicator liveness={tone} label={summary.charAt(0).toUpperCase() + summary.slice(1)} />
            {status && <span className='gempba-connection-status'>{status}</span>}
        </header>;
    }

    protected renderSession(): React.ReactNode {
        const state = this.telemetry.state;
        const disconnected = state === ConnectionState.DISCONNECTED;
        const ssh = this.mode !== ConnectionMode.LOCAL;
        return <Panel title='Session' className='gempba-connection-panel'>
            <SegmentedControl label='Connection mode' options={this.modes.map(mode => MODES[mode])} value={this.mode} disabled={!disconnected}
                onChange={mode => this.changeMode(mode)} />
            {ssh && <>
                <label>{this.mode === ConnectionMode.JUMP ? 'Login node' : 'Host'}
                    <input className='theia-input' list={this.mode === ConnectionMode.JUMP ? 'gempba-recent-login-hosts' : undefined}
                        placeholder='user@host[:port]' value={this.form.host} disabled={!disconnected} onChange={e => this.edit('host', e.target.value)} />
                </label>
                <label>SSH port
                    <input className='theia-input' inputMode='numeric' value={this.form.sshPort} disabled={!disconnected}
                        onChange={e => this.edit('sshPort', digits(e.target.value))} />
                </label>
                <label>Key
                    <span className='gempba-connection-row'>
                        <input className='theia-input' placeholder='default keys in ~/.ssh' value={this.form.sshKey} disabled={!disconnected}
                            onChange={e => this.edit('sshKey', e.target.value)} />
                        <button type='button' className='theia-button secondary' title='Browse for a private key' disabled={!disconnected}
                            onClick={() => this.browseKey()}>…</button>
                    </span>
                </label>
                <div className='gempba-connection-row'>
                    {disconnected
                        ? <IconButton icon='plug' label='Connect' primary={true} onClick={() => this.connect()} />
                        : <IconButton icon={state === ConnectionState.CONNECTING ? 'close' : 'debug-disconnect'}
                            label={state === ConnectionState.CONNECTING ? 'Cancel' : 'Disconnect'} onClick={() => this.run(this.telemetry.disconnect())} />}
                </div>
            </>}
            {!ssh && <p className='gempba-connection-hint'>A gempba on this machine needs no session: set its port and press Listen.</p>}
        </Panel>;
    }

    protected renderTarget(): React.ReactNode {
        const state = this.telemetry.state;
        const disconnected = state === ConnectionState.DISCONNECTED;
        // A local gempba needs no session, so it can be listened to straight away; an SSH target needs Connect first.
        const canListen = state === ConnectionState.CONNECTED || state === ConnectionState.LISTENING || (disconnected && this.mode === ConnectionMode.LOCAL);
        const jumpTarget = (disconnected ? this.mode : this.sessionMode) === ConnectionMode.JUMP;
        return <Panel title='Target' className='gempba-connection-panel'>
            {jumpTarget && <label>Compute node
                <input className='theia-input' list='gempba-recent-targets' placeholder='as the login node knows it' value={this.form.targetHost}
                    onChange={e => this.edit('targetHost', e.target.value)} />
            </label>}
            <label>gempba port
                <input className='theia-input' inputMode='numeric' list='gempba-recent-ports' value={this.form.gempbaPort}
                    onChange={e => this.edit('gempbaPort', digits(e.target.value))} />
            </label>
            <div className='gempba-connection-row'>
                <IconButton icon='radio-tower' label='Listen' primary={true} disabled={!canListen} onClick={() => this.listen()} />
                <IconButton icon='debug-stop' label='Stop' disabled={state !== ConnectionState.LISTENING} onClick={() => this.run(this.telemetry.stop())} />
            </div>
        </Panel>;
    }

    protected renderRate(): React.ReactNode {
        const current = this.telemetry.intervalMs;
        const arriving = this.telemetry.state === ConnectionState.LISTENING ? ObservedIntervals.text(this.telemetry.observedIntervals) : '';
        return <Panel title='Refresh rate' className='gempba-connection-panel'>
            <SegmentedControl label='Refresh rate' value={String(current)}
                options={RefreshInterval.PRESETS_MS.map(ms => ({ value: String(ms), label: RefreshInterval.label(ms) }))}
                onChange={ms => this.run(this.telemetry.setIntervalMs(Number(ms)))} />
            <label>Custom (ms)
                <span className='gempba-connection-row'>
                    <input className='theia-input' type='number' min={RefreshInterval.MIN_MS} max={RefreshInterval.MAX_MS} step={RATE_STEP_MS}
                        value={this.form.intervalMs} onChange={e => this.edit('intervalMs', e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && this.applyRate()} />
                    <IconButton icon='check' label='Apply' onClick={() => this.applyRate()} />
                </span>
            </label>
            {arriving && <p className='gempba-connection-hint'>{arriving.charAt(0).toUpperCase() + arriving.slice(1)}.</p>}
        </Panel>;
    }

    protected renderRun(): React.ReactNode {
        const condition = this.telemetry.condition;
        const offered = RunControl.offered(condition);
        return <Panel title='Run' className='gempba-connection-panel'>
            <div className='gempba-connection-row gempba-connection-wrap'>
                {condition === 'paused'
                    ? <IconButton icon='debug-continue' label='Resume' disabled={!offered.resume} onClick={() => this.run(this.telemetry.resume())} />
                    : <IconButton icon='debug-pause' label='Pause' disabled={!offered.pause} onClick={() => this.run(this.telemetry.pause())} />}
                <IconButton icon='device-camera' label='Snapshot' disabled={!offered.snapshot} onClick={() => this.run(this.telemetry.requestSnapshot())} />
            </div>
            <label>Marker
                <span className='gempba-connection-row'>
                    <input className='theia-input' placeholder='a label for this moment' value={this.form.label} disabled={!offered.mark}
                        onChange={e => this.edit('label', e.target.value)} onKeyDown={e => e.key === 'Enter' && this.mark()} />
                    <IconButton icon='tag' label='Mark' disabled={!offered.mark} onClick={() => this.mark()} />
                </span>
            </label>
            <div className='gempba-connection-row'>
                <IconButton icon='clear-all' label='Clear data' disabled={!StreamCondition.isFrozen(condition)} onClick={() => this.telemetry.clear()} />
            </div>
        </Panel>;
    }

    protected recentPorts(): readonly number[] {
        const mode = this.telemetry.state === ConnectionState.DISCONNECTED ? this.mode : this.sessionMode;
        return mode === ConnectionMode.HOST ? this.settings.host.recentPorts : mode === ConnectionMode.LOCAL ? this.settings.local.recentPorts : [];
    }

    protected changeMode(mode: ConnectionMode): void {
        this.mode = mode;
        this.form = { ...this.formOf(this.settings, mode, this.telemetry.intervalMs), intervalMs: this.form.intervalMs };
        this.problem = '';
        this.update();
    }

    protected edit(field: keyof Form, value: string): void {
        this.form = { ...this.form, [field]: value };
        this.problem = '';
        this.update();
    }

    protected async browseKey(): Promise<void> {
        const uri = await this.fileDialog.showOpenDialog({ title: 'Select an SSH private key', canSelectFiles: true, canSelectFolders: false });
        if (uri) {
            this.edit('sshKey', FileUri.fsPath(uri));
        }
    }

    protected async connect(): Promise<void> {
        const sshPort = port(this.form.sshPort);
        if (this.form.host.trim() === '' || sshPort === undefined) {
            return this.complain('Enter the host as user@host and an SSH port between 1 and 65535.');
        }
        const session = SessionSpec.of({ mode: this.mode, host: this.form.host.trim(), sshPort, sshKey: this.form.sshKey.trim() });
        this.sessionMode = this.mode;
        await this.remember(RememberedSettings.withSession(this.settings, session));
        await this.run(this.telemetry.connect(session));
    }

    protected async listen(): Promise<void> {
        const local = this.telemetry.state === ConnectionState.DISCONNECTED;
        if (local) {
            this.sessionMode = ConnectionMode.LOCAL;
        }
        const gempbaPort = port(this.form.gempbaPort);
        const jump = this.sessionMode === ConnectionMode.JUMP;
        if (gempbaPort === undefined || (jump && this.form.targetHost.trim() === '')) {
            return this.complain(jump ? 'Enter the compute node and a gempba port between 1 and 65535.' : 'Enter a gempba port between 1 and 65535.');
        }
        const target = TargetSpec.of(jump ? this.form.targetHost.trim() : undefined, gempbaPort);
        const remembered = RememberedSettings.withTarget(this.settings, this.sessionMode, target);
        await this.remember(local ? RememberedSettings.withSession(remembered, SessionSpec.local()) : remembered);
        await this.run(this.telemetry.listen(target));
    }

    protected async applyRate(): Promise<void> {
        const intervalMs = RefreshInterval.parse(this.form.intervalMs);
        if (intervalMs === undefined) {
            return this.complain(`Enter the refresh rate in whole milliseconds, between ${RefreshInterval.MIN_MS} and ${RefreshInterval.MAX_MS}.`);
        }
        await this.run(this.telemetry.setIntervalMs(intervalMs));
    }

    protected async mark(): Promise<void> {
        const label = this.form.label.trim();
        const problem = RunControl.labelProblem(label);
        if (problem) {
            return this.complain(`Marker: ${problem}.`);
        }
        this.form = { ...this.form, label: '' };
        await this.run(this.telemetry.mark(label));
    }

    protected async remember(settings: DashboardSettings): Promise<void> {
        this.settings = settings;
        this.update();
        await this.settingsServer.save(settings);
    }

    protected complain(problem: string): void {
        this.problem = problem;
        this.update();
    }

    protected async run(action: Promise<void>): Promise<void> {
        try {
            await action;
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }
}

/** Ports are identifiers, not quantities: typed as text, keeping only the digits. */
function digits(text: string): string {
    return text.replace(/\D/g, '');
}

function port(text: string): number | undefined {
    const value = Number(text);
    return Number.isInteger(value) && value >= 1 && value <= 65535 ? value : undefined;
}
