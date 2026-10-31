import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MockConfig } from '../common/mock-config';
import { MockFault } from '../common/mock-fault';
import { MockChoice, MockLabels } from '../common/mock-labels';
import { MockStatus } from '../common/mock-protocol';
import { MockController } from './mock-controller';
import { MockViewContribution } from './mock-view-contribution';

const CATEGORY = 'GemPBA Mock';

export namespace MockCommands {
    export const START: Command = { id: 'gempba.mock.start', category: CATEGORY, label: 'Start…' };
    export const STOP: Command = { id: 'gempba.mock.stop', category: CATEGORY, label: 'Stop' };
    export const CONNECT: Command = { id: 'gempba.mock.connect', category: CATEGORY, label: 'Connect This Window' };
    export const DISCONNECT: Command = { id: 'gempba.mock.disconnect', category: CATEGORY, label: 'Disconnect This Window' };
    export const SCENARIO: Command = { id: 'gempba.mock.scenario', category: CATEGORY, label: 'Change Scenario…' };
    export const FAULT: Command = { id: 'gempba.mock.fault', category: CATEGORY, label: 'Inject Fault…' };
    export const SHOW: Command = { id: 'gempba.mock.show', category: CATEGORY, label: 'Show Panel' };
    /** The status bar entry's menu of the others; without a label it stays out of the palette. */
    export const ACTIONS: Command = { id: 'gempba.mock.actions' };
}

/**
 * The mocker in the command palette: Start… asks for the mode and scenario and runs them on the last configuration,
 * then offers to connect this window; the rest act on the running mock, Connect and Disconnect as this window streams it.
 */
@injectable()
export class MockCommandContribution implements CommandContribution {

    @inject(MockController) protected readonly mock: MockController;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(MockViewContribution) protected readonly view: MockViewContribution;

    registerCommands(commands: CommandRegistry): void {
        const running = () => this.mock.status.running;
        commands.registerCommand(MockCommands.START, { execute: () => this.start(), isEnabled: () => !running() });
        commands.registerCommand(MockCommands.STOP, { execute: () => this.run(this.mock.stop()), isEnabled: running });
        commands.registerCommand(MockCommands.CONNECT, { execute: () => this.run(this.mock.connect()), isEnabled: () => running() && !this.mock.connected });
        commands.registerCommand(MockCommands.DISCONNECT, { execute: () => this.run(this.mock.disconnect()), isEnabled: () => this.mock.connected });
        commands.registerCommand(MockCommands.SCENARIO, { execute: () => this.changeScenario(), isEnabled: running });
        commands.registerCommand(MockCommands.FAULT, { execute: () => this.injectFault(), isEnabled: running });
        commands.registerCommand(MockCommands.SHOW, { execute: () => this.view.openView({ activate: true, reveal: true }) });
        commands.registerCommand(MockCommands.ACTIONS, { execute: () => this.actions(commands) });
    }

    protected async start(): Promise<void> {
        const last = await this.mock.lastConfig();
        const mode = await this.pick('How the dashboard reaches the mock', MockLabels.MODES, last.access.mode);
        const scenario = mode && await this.pick('What the run does', MockLabels.SCENARIOS, last.live.scenario);
        if (!mode || !scenario) {
            return;
        }
        const config: MockConfig = { ...last, access: { ...last.access, mode }, live: { ...last.live, scenario } };
        try {
            const status = await this.mock.start(config);
            const connect = await this.messages.info(MockStatus.summary(status), 'Connect This Window');
            if (connect) {
                await this.run(this.mock.connect());
            }
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }

    protected async changeScenario(): Promise<void> {
        const live = this.mock.status.config?.live;
        const scenario = live && await this.pick('What the run does from now on', MockLabels.SCENARIOS, live.scenario);
        if (live && scenario) {
            await this.run(this.mock.setLive({ ...live, scenario }));
        }
    }

    protected async injectFault(): Promise<void> {
        const picked = await this.quickInput.showQuickPick(MockFault.ALL.map(fault => ({ label: MockFault.label(fault), fault })), { placeholder: 'Inject a fault' });
        if (picked) {
            await this.run(this.mock.fault(picked.fault).then(message => this.messages.info(message)).then(() => undefined));
        }
    }

    protected async actions(commands: CommandRegistry): Promise<void> {
        const items = [MockCommands.SHOW, MockCommands.CONNECT, MockCommands.DISCONNECT, MockCommands.SCENARIO, MockCommands.FAULT, MockCommands.STOP]
            .filter(command => commands.isEnabled(command.id))
            .map(command => ({ label: command.label!, id: command.id }));
        const picked = await this.quickInput.showQuickPick(items, { placeholder: MockStatus.summary(this.mock.status) });
        if (picked) {
            await commands.executeCommand(picked.id);
        }
    }

    protected async pick<T>(placeholder: string, choices: readonly MockChoice<T>[], current: T): Promise<T | undefined> {
        const items: (QuickPickItem & { value: T })[] = choices.map(choice => ({
            label: choice.label, detail: choice.detail, value: choice.value, description: choice.value === current ? 'last used' : undefined
        }));
        const picked = await this.quickInput.showQuickPick(items, { placeholder, activeItem: items.find(item => item.value === current) });
        return picked?.value;
    }

    protected async run(action: Promise<void>): Promise<void> {
        try {
            await action;
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }
}
