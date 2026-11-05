import { CommonMenus } from '@theia/core/lib/browser/common-menus';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Config, ConnectionMode, ConnectionState, SessionSpec, StreamCondition, TargetSpec } from '@gempba/core';
import { TelemetryService } from '../common/telemetry-service';

export namespace TelemetryCommands {
    const CATEGORY = 'GemPBA';
    export const CONNECT: Command = { id: 'gempba.connect', category: CATEGORY, label: 'Connect…' };
    export const LISTEN: Command = { id: 'gempba.listen', category: CATEGORY, label: 'Listen…' };
    export const STOP: Command = { id: 'gempba.stop', category: CATEGORY, label: 'Stop Listening' };
    export const DISCONNECT: Command = { id: 'gempba.disconnect', category: CATEGORY, label: 'Disconnect' };
    export const CLEAR: Command = { id: 'gempba.clear', category: CATEGORY, label: 'Clear Data' };
    export const SET_RATE: Command = { id: 'gempba.setRefreshRate', category: CATEGORY, label: 'Set Refresh Rate…' };
}

export namespace TelemetryMenus {
    /** The File menu's first group: the connection commands now, and the session commands (site manager, new session) later. */
    export const SESSION = [...CommonMenus.FILE, '0_session'];
    /**
     * The live controls, opened from a live view's tab and from the status bar entry. A new control is one command and
     * one menu item here, with no change to the views.
     */
    export const CONTROLS = ['gempba-telemetry-controls'];
    export const RATES = [...CONTROLS, '1_rates'];
    export const RATE = [...RATES, 'rate'];
    export const STREAM = [...CONTROLS, '2_stream'];
    export const DATA = [...CONTROLS, '3_data'];
}

const MODE_LABELS: Record<ConnectionMode, string> = {
    [ConnectionMode.LOCAL]: 'Local: gempba on this machine',
    [ConnectionMode.HOST]: 'Host: a VM over SSH',
    [ConnectionMode.JUMP]: 'Jump host: a compute node through a login node'
};

/**
 * Drives the stream from the File menu and the command palette, so it works without any connection UI installed.
 * Connect opens an SSH session in one of the installed SSH modes, and is absent when there is none; Listen while
 * disconnected streams a gempba on this machine, which needs no session.
 */
@injectable()
export class TelemetryCommandContribution implements CommandContribution, MenuContribution {

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected session = SessionSpec.local();
    protected sshModes: ConnectionMode[] = [];
    protected lastTargetHost = '';
    protected lastPort = Config.DEFAULT_PORT;

    @postConstruct()
    protected init(): void {
        this.telemetry.availableModes().then(modes => this.sshModes = modes.filter(mode => mode !== ConnectionMode.LOCAL), () => undefined);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(TelemetryCommands.CONNECT, {
            isVisible: () => this.sshModes.length > 0,
            isEnabled: () => this.telemetry.state === ConnectionState.DISCONNECTED && this.sshModes.length > 0,
            execute: () => this.connect()
        });
        registry.registerCommand(TelemetryCommands.LISTEN, {
            isEnabled: () => this.telemetry.state !== ConnectionState.CONNECTING,
            execute: () => this.listen()
        });
        registry.registerCommand(TelemetryCommands.STOP, {
            isEnabled: () => this.telemetry.state === ConnectionState.LISTENING,
            execute: () => this.run(this.telemetry.stop())
        });
        registry.registerCommand(TelemetryCommands.DISCONNECT, {
            isEnabled: () => this.telemetry.state !== ConnectionState.DISCONNECTED,
            execute: () => this.run(this.telemetry.disconnect())
        });
        registry.registerCommand(TelemetryCommands.CLEAR, {
            isEnabled: () => StreamCondition.isFrozen(this.telemetry.condition),
            execute: () => this.telemetry.clear()
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        [TelemetryCommands.CONNECT, TelemetryCommands.LISTEN, TelemetryCommands.STOP, TelemetryCommands.DISCONNECT, TelemetryCommands.CLEAR]
            .forEach((command, index) => menus.registerMenuAction(TelemetryMenus.SESSION, { commandId: command.id, order: String(index) }));
        [TelemetryCommands.STOP, TelemetryCommands.DISCONNECT]
            .forEach((command, index) => menus.registerMenuAction(TelemetryMenus.STREAM, { commandId: command.id, order: String(index) }));
        menus.registerMenuAction(TelemetryMenus.DATA, { commandId: TelemetryCommands.CLEAR.id });
    }

    protected async connect(): Promise<void> {
        const session = await this.askSession();
        if (session) {
            this.session = session;
            await this.run(this.telemetry.connect(session));
        }
    }

    protected async askSession(): Promise<SessionSpec | undefined> {
        const modes = this.sshModes;
        const mode = modes.length === 1 ? modes[0] : (await this.quickInput.showQuickPick<QuickPickItem & { mode: ConnectionMode }>(
            modes.map(candidate => ({ label: MODE_LABELS[candidate], mode: candidate })), { title: 'GemPBA: Connect' }))?.mode;
        if (mode === undefined) {
            return undefined;
        }
        const host = await this.quickInput.input({
            title: `GemPBA: Connect (${MODE_LABELS[mode]})`,
            prompt: mode === ConnectionMode.JUMP ? 'Login node as user@host[:port]' : 'VM as user@host[:port]',
            value: this.session.mode === mode ? this.session.host : '',
            validateInput: async input => input.trim() === '' ? 'Enter the SSH host' : undefined
        });
        if (host === undefined) {
            return undefined;
        }
        const sshKey = await this.quickInput.input({
            title: `GemPBA: Connect (${MODE_LABELS[mode]})`,
            prompt: 'Private key file; leave empty to use your default keys in ~/.ssh',
            value: this.session.mode === mode ? this.session.sshKey : ''
        });
        return sshKey === undefined ? undefined : SessionSpec.of({ mode, host: host.trim(), sshKey: sshKey.trim() });
    }

    protected async listen(): Promise<void> {
        if (this.telemetry.state === ConnectionState.DISCONNECTED) {
            this.session = SessionSpec.local();
        }
        let targetHost = '';
        if (this.session.mode === ConnectionMode.JUMP) {
            const node = await this.quickInput.input({
                title: 'GemPBA: Listen',
                prompt: 'Compute node running gempba, as seen from the login node',
                value: this.lastTargetHost,
                validateInput: async input => input.trim() === '' ? 'Enter the compute node' : undefined
            });
            if (node === undefined) {
                return;
            }
            targetHost = this.lastTargetHost = node.trim();
        }
        const value = await this.quickInput.input({
            title: 'GemPBA: Listen',
            prompt: 'Port gempba\'s telemetry listens on',
            value: String(this.lastPort),
            validateInput: async input => isPort(input) ? undefined : 'Enter a port between 1 and 65535'
        });
        if (value === undefined) {
            return;
        }
        this.lastPort = Number(value);
        await this.run(this.telemetry.listen(TargetSpec.of(targetHost, this.lastPort)));
    }

    protected async run(action: Promise<void>): Promise<void> {
        try {
            await action;
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }
}

function isPort(input: string): boolean {
    const port = Number(input);
    return Number.isInteger(port) && port >= 1 && port <= 65535;
}
