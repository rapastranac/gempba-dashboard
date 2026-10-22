import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickInputService } from '@theia/core/lib/common/quick-pick-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Config, ConnectionState, SessionSpec, TargetSpec } from '@gempba/core';
import { TelemetryService } from '../common/telemetry-service';

export namespace TelemetryCommands {
    const CATEGORY = 'GemPBA';
    export const CONNECT_LOCAL: Command = { id: 'gempba.connectLocal', category: CATEGORY, label: 'Connect (Local)' };
    export const LISTEN: Command = { id: 'gempba.listen', category: CATEGORY, label: 'Listen…' };
    export const STOP: Command = { id: 'gempba.stop', category: CATEGORY, label: 'Stop Listening' };
    export const DISCONNECT: Command = { id: 'gempba.disconnect', category: CATEGORY, label: 'Disconnect' };
}

/** Drives the stream from the command palette, so it works without any connection UI installed. */
@injectable()
export class TelemetryCommandContribution implements CommandContribution {

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected lastPort = Config.DEFAULT_PORT;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(TelemetryCommands.CONNECT_LOCAL, {
            isEnabled: () => this.telemetry.state === ConnectionState.DISCONNECTED,
            execute: () => this.run(this.telemetry.connect(SessionSpec.local()))
        });
        registry.registerCommand(TelemetryCommands.LISTEN, {
            isEnabled: () => this.telemetry.state === ConnectionState.CONNECTED || this.telemetry.state === ConnectionState.LISTENING,
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
    }

    protected async listen(): Promise<void> {
        const value = await this.quickInput.input({
            title: 'GemPBA: Listen',
            prompt: 'Port the gempba center listens on',
            value: String(this.lastPort),
            validateInput: async input => isPort(input) ? undefined : 'Enter a port between 1 and 65535'
        });
        if (value === undefined) {
            return;
        }
        this.lastPort = Number(value);
        await this.run(this.telemetry.listen(TargetSpec.of(undefined, this.lastPort)));
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
