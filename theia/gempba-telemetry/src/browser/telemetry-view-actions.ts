import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { StreamText } from '@gempba/core';
import { TelemetryCommands } from './telemetry-command-contribution';

/**
 * The hub's commands as a live view's buttons: only those the hub runs now, so a view never offers a button that
 * does nothing, and a click never leaves a rejection behind.
 */
export namespace TelemetryViewActions {

    /** The registry calls the actions need. */
    export type Commands = Pick<CommandRegistry, 'isVisible' | 'isEnabled' | 'executeCommand'>;

    export interface Button {
        readonly label: string;
        /** A codicon name. */
        readonly icon?: string;
        readonly primary?: boolean;
        readonly run: () => void;
    }

    const BAR: Record<StreamText.Action, { readonly command: Command, readonly icon: string }> = {
        resume: { command: TelemetryCommands.RESUME, icon: 'debug-continue' },
        snapshot: { command: TelemetryCommands.SNAPSHOT, icon: 'device-camera' },
        listen: { command: TelemetryCommands.LISTEN, icon: 'debug-restart' },
        connect: { command: TelemetryCommands.CONNECT, icon: 'plug' },
        clear: { command: TelemetryCommands.CLEAR, icon: 'clear-all' }
    };

    /** The stream bar's actions, those the hub offers now. */
    export function bar(registry: Commands, actions: readonly StreamText.Action[]): Button[] {
        return actions.filter(action => offered(registry, BAR[action].command)).map(action => ({
            label: StreamText.actionLabel(action), icon: BAR[action].icon, run: () => execute(registry, BAR[action].command)
        }));
    }

    /** How an empty view starts a stream: Listen…, and Connect… where an SSH mode is installed and no session is open. */
    export function start(registry: Commands): Button[] {
        return [TelemetryCommands.LISTEN, TelemetryCommands.CONNECT].filter(command => offered(registry, command)).map(command => ({
            label: command.label!, primary: command === TelemetryCommands.LISTEN, run: () => execute(registry, command)
        }));
    }

    function offered(registry: Commands, command: Command): boolean {
        return registry.isVisible(command.id) && registry.isEnabled(command.id);
    }

    function execute(registry: Commands, command: Command): void {
        registry.executeCommand(command.id).catch(() => undefined);
    }
}
