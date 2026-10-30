import { MessageService } from '@theia/core/lib/common/message-service';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { FileDialogService } from '@theia/filesystem/lib/browser/file-dialog/file-dialog-service';
import { ConnectionMode, ConnectionState, DashboardSettings, RefreshInterval, RefreshRates, SessionSpec, TargetSpec } from '@gempba/core';
import { TelemetryService } from '@gempba/telemetry/lib/common';
import { RememberedSettings } from '../common/remembered-settings';
import { SettingsServer } from '../common/settings-protocol';

/** The arrows of a rate field move by this much; gempba itself takes any value between its bounds. */
const RATE_STEP_MS = 50;

const MODE_LABELS: Record<ConnectionMode, string> = {
    [ConnectionMode.LOCAL]: 'Local',
    [ConnectionMode.HOST]: 'Host (a VM over SSH)',
    [ConnectionMode.JUMP]: 'Jump host (through a login node)'
};

interface Form {
    host: string;
    sshPort: string;
    sshKey: string;
    targetHost: string;
    gempbaPort: string;
    workerIntervalMs: string;
    nodeIntervalMs: string;
}

/**
 * The connection controls: the session (mode, host, key) and the target (compute node, port), pre-filled from the
 * remembered settings and never connecting on its own, and the refresh rates, which the hub keeps as settings. Only
 * the SSH modes have a session to connect; a local gempba is listened to directly. It only drives TelemetryService,
 * so the palette commands keep working without it.
 */
@injectable()
export class ConnectionWidget extends ReactWidget {

    static readonly ID = 'gempba-connection';
    static readonly LABEL = 'Connection';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(SettingsServer) protected readonly settingsServer: SettingsServer;
    @inject(FileDialogService) protected readonly fileDialog: FileDialogService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected settings = DashboardSettings.defaults();
    protected modes: ConnectionMode[] = [ConnectionMode.LOCAL];
    protected mode = ConnectionMode.LOCAL;
    /** The mode of the session this view opened; the target fields follow it. */
    protected sessionMode = ConnectionMode.LOCAL;
    /** Field initializers run before injection, so the rates start at their defaults until the remembered settings are restored. */
    protected form: Form = this.formOf(this.settings, this.mode, RefreshRates.defaults());
    protected problem = '';

    @postConstruct()
    protected init(): void {
        this.id = ConnectionWidget.ID;
        this.title.label = ConnectionWidget.LABEL;
        this.title.caption = 'GemPBA connection';
        this.title.iconClass = codicon('plug');
        this.title.closable = false;
        this.addClass('gempba-connection');
        this.toDispose.push(this.telemetry.onStateChange(() => this.update()));
        this.toDispose.push(this.telemetry.onStatus(() => this.update()));
        this.toDispose.push(this.telemetry.onRatesChange(rates => this.showRates(rates)));
        this.restore();
    }

    protected async restore(): Promise<void> {
        const [settings, modes] = await Promise.all([this.settingsServer.load(), this.telemetry.availableModes()]);
        this.settings = settings;
        this.modes = modes;
        this.mode = this.sessionMode = modes.includes(settings.lastMode) ? settings.lastMode : ConnectionMode.LOCAL;
        this.form = this.formOf(settings, this.mode, this.telemetry.rates);
        this.update();
    }

    protected formOf(settings: DashboardSettings, mode: ConnectionMode, rates: RefreshRates): Form {
        const session = RememberedSettings.sessionOf(settings, mode);
        const target = RememberedSettings.targetOf(settings, mode);
        return {
            host: session.host,
            sshPort: String(session.sshPort),
            sshKey: session.sshKey,
            targetHost: target.targetHost,
            gempbaPort: String(target.gempbaPort),
            workerIntervalMs: String(rates.workerIntervalMs),
            nodeIntervalMs: String(rates.nodeIntervalMs)
        };
    }

    /** Rates changed anywhere (a view's controls, the Settings page, another window) replace the ones typed here. */
    protected showRates(rates: RefreshRates): void {
        this.form = { ...this.form, workerIntervalMs: String(rates.workerIntervalMs), nodeIntervalMs: String(rates.nodeIntervalMs) };
        this.update();
    }

    protected render(): React.ReactNode {
        const state = this.telemetry.state;
        const disconnected = state === ConnectionState.DISCONNECTED;
        const ssh = this.mode !== ConnectionMode.LOCAL;
        // A local gempba needs no session, so it can be listened to straight away; an SSH target needs Connect first.
        const canListen = state === ConnectionState.CONNECTED || state === ConnectionState.LISTENING || (disconnected && !ssh);
        const jumpTarget = (disconnected ? this.mode : this.sessionMode) === ConnectionMode.JUMP;
        return <div className='gempba-connection-form'>
            <section>
                <h3>Session</h3>
                <label>Mode
                    <select className='theia-select' value={this.mode} disabled={!disconnected} onChange={e => this.changeMode(e.target.value as ConnectionMode)}>
                        {this.modes.map(mode => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
                    </select>
                </label>
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
                            <button className='theia-button secondary' disabled={!disconnected} onClick={() => this.browseKey()}>…</button>
                        </span>
                    </label>
                    <div className='gempba-connection-row'>
                        {disconnected
                            ? <button className='theia-button' onClick={() => this.connect()}>Connect</button>
                            : <button className='theia-button secondary' onClick={() => this.run(this.telemetry.disconnect())}>
                                {state === ConnectionState.CONNECTING ? 'Cancel' : 'Disconnect'}
                            </button>}
                    </div>
                </>}
                {!ssh && <p className='gempba-connection-hint'>A gempba on this machine needs no session: set its port and press Listen.</p>}
            </section>
            <section>
                <h3>Target</h3>
                {jumpTarget && <label>Compute node
                    <input className='theia-input' list='gempba-recent-targets' placeholder='as the login node knows it' value={this.form.targetHost}
                        onChange={e => this.edit('targetHost', e.target.value)} />
                </label>}
                <label>gempba port
                    <input className='theia-input' inputMode='numeric' list='gempba-recent-ports' value={this.form.gempbaPort}
                        onChange={e => this.edit('gempbaPort', digits(e.target.value))} />
                </label>
                <div className='gempba-connection-row'>
                    <button className='theia-button' disabled={!canListen} onClick={() => this.listen()}>Listen</button>
                    <button className='theia-button secondary' disabled={state !== ConnectionState.LISTENING} onClick={() => this.run(this.telemetry.stop())}>Stop</button>
                </div>
            </section>
            <section>
                <h3>Refresh rates</h3>
                <label>Worker (ms)
                    <input className='theia-input' type='number' min={RefreshInterval.MIN_MS} max={RefreshInterval.MAX_MS} step={RATE_STEP_MS}
                        value={this.form.workerIntervalMs} onChange={e => this.edit('workerIntervalMs', e.target.value)} />
                </label>
                <label>Node (ms)
                    <input className='theia-input' type='number' min={RefreshInterval.MIN_MS} max={RefreshInterval.MAX_MS} step={RATE_STEP_MS}
                        value={this.form.nodeIntervalMs} onChange={e => this.edit('nodeIntervalMs', e.target.value)} />
                </label>
                <div className='gempba-connection-row'>
                    <button className='theia-button secondary' onClick={() => this.applyRates()}>Apply rates</button>
                </div>
            </section>
            {this.problem && <p className='gempba-connection-problem'>{this.problem}</p>}
            <p className='gempba-connection-status'>{this.telemetry.status || state.toLowerCase()}</p>
            <datalist id='gempba-recent-ports'>{this.recentPorts().map(port => <option key={port} value={port} />)}</datalist>
            <datalist id='gempba-recent-targets'>{this.settings.jump.recentTargets.map(node => <option key={node} value={node} />)}</datalist>
            <datalist id='gempba-recent-login-hosts'>{this.settings.jump.recentLoginHosts.map(host => <option key={host} value={host} />)}</datalist>
        </div>;
    }

    protected recentPorts(): readonly number[] {
        const mode = this.telemetry.state === ConnectionState.DISCONNECTED ? this.mode : this.sessionMode;
        return mode === ConnectionMode.HOST ? this.settings.host.recentPorts : mode === ConnectionMode.LOCAL ? this.settings.local.recentPorts : [];
    }

    protected changeMode(mode: ConnectionMode): void {
        this.mode = mode;
        this.form = { ...this.formOf(this.settings, mode, this.telemetry.rates), workerIntervalMs: this.form.workerIntervalMs, nodeIntervalMs: this.form.nodeIntervalMs };
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

    protected async applyRates(): Promise<void> {
        const workerIntervalMs = RefreshInterval.parse(this.form.workerIntervalMs);
        const nodeIntervalMs = RefreshInterval.parse(this.form.nodeIntervalMs);
        if (workerIntervalMs === undefined || nodeIntervalMs === undefined) {
            return this.complain(`Enter each rate in whole milliseconds, between ${RefreshInterval.MIN_MS} and ${RefreshInterval.MAX_MS}.`);
        }
        await this.run(this.telemetry.setRates({ workerIntervalMs, nodeIntervalMs }));
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
