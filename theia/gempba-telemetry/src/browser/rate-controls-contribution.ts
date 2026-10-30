import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RefreshInterval, RefreshRates } from '@gempba/core';
import { TelemetryService } from '../common/telemetry-service';
import { TelemetryCommands, TelemetryMenus } from './telemetry-command-contribution';

/** One of the two rates gempba takes, and how the controls name it. */
interface Rate {
    readonly field: keyof RefreshRates;
    /** The rate's id in command ids. */
    readonly id: string;
    readonly menu: string[];
    readonly menuLabel: string;
    readonly command: Command;
    readonly what: string;
}

const RATES: readonly Rate[] = [
    {
        field: 'workerIntervalMs', id: 'workerRate', menu: TelemetryMenus.WORKER_RATES, menuLabel: 'Worker Frames',
        command: TelemetryCommands.SET_WORKER_RATE, what: 'each worker sends a frame'
    },
    {
        field: 'nodeIntervalMs', id: 'nodeRate', menu: TelemetryMenus.NODE_RATES, menuLabel: 'Node Frames',
        command: TelemetryCommands.SET_NODE_RATE, what: 'each node\'s sentinel sends a node frame'
    }
];

/**
 * The refresh rate controls: a submenu per rate in the live controls menu, with a checked item per preset and
 * Custom…, and a palette command per rate. Each choice saves the rate as the user's setting, which the hub sends.
 */
@injectable()
export class RateControlsContribution implements CommandContribution, MenuContribution {

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;

    registerCommands(registry: CommandRegistry): void {
        for (const rate of RATES) {
            registry.registerCommand(rate.command, { execute: () => this.pick(rate) });
            // the presets and Custom… have no label, so they stay out of the palette, which has the command above
            for (const ms of RefreshInterval.PRESETS_MS) {
                registry.registerCommand({ id: presetId(rate, ms) }, {
                    execute: () => this.set(rate, ms),
                    isToggled: () => this.telemetry.rates[rate.field] === ms
                });
            }
            registry.registerCommand({ id: customId(rate) }, {
                execute: () => this.askCustom(rate),
                isToggled: () => !RefreshInterval.PRESETS_MS.includes(this.telemetry.rates[rate.field])
            });
        }
    }

    registerMenus(menus: MenuModelRegistry): void {
        RATES.forEach((rate, index) => {
            menus.registerSubmenu(rate.menu, rate.menuLabel, { sortString: String(index) });
            RefreshInterval.PRESETS_MS.forEach((ms, order) => menus.registerMenuAction([...rate.menu, '1_presets'], {
                commandId: presetId(rate, ms), label: RefreshInterval.label(ms), order: String(order).padStart(2, '0')
            }));
            menus.registerMenuAction([...rate.menu, '2_custom'], { commandId: customId(rate), label: 'Custom…' });
        });
    }

    protected async pick(rate: Rate): Promise<void> {
        const current = this.telemetry.rates[rate.field];
        const observed = this.telemetry.observedRates[rate.field];
        const items: (QuickPickItem & { ms?: number })[] = [
            ...RefreshInterval.PRESETS_MS.map(ms => ({ label: RefreshInterval.label(ms), description: ms === current ? 'current' : undefined, ms })),
            { label: 'Custom…', description: RefreshInterval.PRESETS_MS.includes(current) ? undefined : `current: ${RefreshInterval.label(current)}` }
        ];
        const picked = await this.quickInput.showQuickPick(items, {
            title: rate.command.label,
            placeholder: `How often ${rate.what}${observed === undefined ? '' : `; frames now arrive every ${RefreshInterval.label(observed)}`}`
        });
        if (picked) {
            await (picked.ms === undefined ? this.askCustom(rate) : this.set(rate, picked.ms));
        }
    }

    protected async askCustom(rate: Rate): Promise<void> {
        const value = await this.quickInput.input({
            title: rate.command.label,
            prompt: `How often ${rate.what}, in milliseconds (${RefreshInterval.MIN_MS} to ${RefreshInterval.MAX_MS})`,
            value: String(this.telemetry.rates[rate.field]),
            validateInput: async input => RefreshInterval.parse(input) === undefined
                ? `Enter whole milliseconds between ${RefreshInterval.MIN_MS} and ${RefreshInterval.MAX_MS}`
                : undefined
        });
        const ms = value === undefined ? undefined : RefreshInterval.parse(value);
        if (ms !== undefined) {
            await this.set(rate, ms);
        }
    }

    protected async set(rate: Rate, ms: number): Promise<void> {
        try {
            await this.telemetry.setRates({ [rate.field]: ms });
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }
}

function presetId(rate: Rate, ms: number): string {
    return `gempba.${rate.id}.${ms}`;
}

function customId(rate: Rate): string {
    return `gempba.${rate.id}.custom`;
}
