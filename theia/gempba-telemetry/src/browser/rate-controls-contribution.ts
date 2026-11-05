import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { QuickInputService, QuickPickItem } from '@theia/core/lib/common/quick-pick-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { RefreshInterval } from '@gempba/core';
import { ObservedIntervals, TelemetryService } from '../common/telemetry-service';
import { TelemetryCommands, TelemetryMenus } from './telemetry-command-contribution';

const CUSTOM_ID = 'gempba.refreshRate.custom';

/**
 * The refresh rate control: a Refresh Rate submenu in the live controls menu, with a checked item per preset and
 * Custom…, and a palette command. Each choice saves the rate as the user's setting, which the hub sends.
 */
@injectable()
export class RateControlsContribution implements CommandContribution, MenuContribution {

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(TelemetryCommands.SET_RATE, { execute: () => this.pick() });
        // the presets and Custom… have no label, so they stay out of the palette, which has the command above
        for (const ms of RefreshInterval.PRESETS_MS) {
            registry.registerCommand({ id: presetId(ms) }, {
                execute: () => this.set(ms),
                isToggled: () => this.telemetry.intervalMs === ms
            });
        }
        registry.registerCommand({ id: CUSTOM_ID }, {
            execute: () => this.askCustom(),
            isToggled: () => !RefreshInterval.PRESETS_MS.includes(this.telemetry.intervalMs)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(TelemetryMenus.RATE, 'Refresh Rate');
        RefreshInterval.PRESETS_MS.forEach((ms, order) => menus.registerMenuAction([...TelemetryMenus.RATE, '1_presets'], {
            commandId: presetId(ms), label: RefreshInterval.label(ms), order: String(order).padStart(2, '0')
        }));
        menus.registerMenuAction([...TelemetryMenus.RATE, '2_custom'], { commandId: CUSTOM_ID, label: 'Custom…' });
    }

    protected async pick(): Promise<void> {
        const current = this.telemetry.intervalMs;
        const observed = ObservedIntervals.text(this.telemetry.observedIntervals);
        const items: (QuickPickItem & { ms?: number })[] = [
            ...RefreshInterval.PRESETS_MS.map(ms => ({ label: RefreshInterval.label(ms), description: ms === current ? 'current' : undefined, ms })),
            { label: 'Custom…', description: RefreshInterval.PRESETS_MS.includes(current) ? undefined : `current: ${RefreshInterval.label(current)}` }
        ];
        const picked = await this.quickInput.showQuickPick(items, {
            title: TelemetryCommands.SET_RATE.label,
            placeholder: `How often gempba sends every frame${observed ? `; ${observed}` : ''}`
        });
        if (picked) {
            await (picked.ms === undefined ? this.askCustom() : this.set(picked.ms));
        }
    }

    protected async askCustom(): Promise<void> {
        const value = await this.quickInput.input({
            title: TelemetryCommands.SET_RATE.label,
            prompt: `How often gempba sends every frame, in milliseconds (${RefreshInterval.MIN_MS} to ${RefreshInterval.MAX_MS})`,
            value: String(this.telemetry.intervalMs),
            validateInput: async input => RefreshInterval.parse(input) === undefined
                ? `Enter whole milliseconds between ${RefreshInterval.MIN_MS} and ${RefreshInterval.MAX_MS}`
                : undefined
        });
        const ms = value === undefined ? undefined : RefreshInterval.parse(value);
        if (ms !== undefined) {
            await this.set(ms);
        }
    }

    protected async set(ms: number): Promise<void> {
        try {
            await this.telemetry.setIntervalMs(ms);
        } catch (error) {
            this.messages.error(error instanceof Error ? error.message : String(error));
        }
    }
}

function presetId(ms: number): string {
    return `gempba.refreshRate.${ms}`;
}
