import { CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ChartCatalog } from '../common/chart-catalog';
import { ChartLayouts } from './chart-layouts';

/**
 * The menus that edit a Cards panel's chart layout: the chart area's (add a chart, reset to the default), opened with
 * the panel's kind, and each chart's (show a count as a rate or so far, swap it, move it, remove it), opened with the
 * kind and the chart's place. Their commands have no palette labels: they act on the chart the menu opened from.
 */
export namespace ChartMenus {
    export const AREA = ['gempba-cards-charts'];
    export const ADD = [...AREA, '1_add', 'add'];
    export const RESET = [...AREA, '2_reset'];
    export const TILE = ['gempba-cards-chart'];
    export const FORM = [...TILE, '1_form'];
    export const SWAP = [...TILE, '2_swap', 'swap'];
    export const MOVE = [...TILE, '3_move'];
    export const REMOVE = [...TILE, '4_remove'];
}

const IDS = ChartCatalog.IDS.rank;
const isKind = (kind: unknown): kind is ChartCatalog.Kind => kind === 'rank' || kind === 'node';
const offers = (kind: unknown, id: ChartCatalog.Id): boolean => isKind(kind) && ChartCatalog.IDS[kind].includes(id);

@injectable()
export class ChartMenuContribution implements CommandContribution, MenuContribution {

    static readonly RESET = 'gempba.cards.charts.reset';
    static readonly SHOW_RATE = 'gempba.cards.chart.showRate';
    static readonly SHOW_TOTAL = 'gempba.cards.chart.showTotal';
    static readonly MOVE_EARLIER = 'gempba.cards.chart.moveEarlier';
    static readonly MOVE_LATER = 'gempba.cards.chart.moveLater';
    static readonly REMOVE = 'gempba.cards.chart.remove';

    @inject(ChartLayouts) protected readonly layouts: ChartLayouts;

    static add(id: ChartCatalog.Id): string {
        return `gempba.cards.charts.add.${id}`;
    }

    static swap(id: ChartCatalog.Id): string {
        return `gempba.cards.chart.swap.${id}`;
    }

    registerCommands(registry: CommandRegistry): void {
        for (const id of IDS) {
            registry.registerCommand({ id: ChartMenuContribution.add(id) }, {
                isVisible: (kind: unknown) => offers(kind, id),
                isEnabled: (kind: unknown) => offers(kind, id) && ChartCatalog.canAdd(this.layoutOf(kind), id),
                execute: (kind: unknown) => this.edit(kind, tiles => ChartCatalog.add(tiles, id))
            });
            registry.registerCommand({ id: ChartMenuContribution.swap(id) }, {
                isVisible: (kind: unknown) => offers(kind, id),
                isEnabled: (kind: unknown, index: number) => offers(kind, id) && ChartCatalog.canSwap(this.layoutOf(kind), index, id),
                execute: (kind: unknown, index: number) => this.edit(kind, tiles => ChartCatalog.swap(tiles, index, id))
            });
        }
        registry.registerCommand({ id: ChartMenuContribution.RESET }, {
            isVisible: (kind: unknown) => isKind(kind),
            execute: (kind: unknown) => isKind(kind) ? this.layouts.reset(kind) : undefined
        });
        for (const [command, form] of [[ChartMenuContribution.SHOW_RATE, 'rate'], [ChartMenuContribution.SHOW_TOTAL, 'total']] as const) {
            registry.registerCommand({ id: command }, {
                isVisible: (kind: unknown, index: number) => ChartCatalog.canShowAs(this.layoutOf(kind), index, form),
                execute: (kind: unknown, index: number) => this.edit(kind, tiles => ChartCatalog.showAs(tiles, index, form))
            });
        }
        for (const [command, step] of [[ChartMenuContribution.MOVE_EARLIER, -1], [ChartMenuContribution.MOVE_LATER, 1]] as const) {
            registry.registerCommand({ id: command }, {
                isVisible: (kind: unknown) => isKind(kind),
                isEnabled: (kind: unknown, index: number) => this.layoutOf(kind)[index + step] !== undefined,
                execute: (kind: unknown, index: number) => this.edit(kind, tiles => ChartCatalog.move(tiles, index, index + step))
            });
        }
        registry.registerCommand({ id: ChartMenuContribution.REMOVE }, {
            isVisible: (kind: unknown) => isKind(kind),
            execute: (kind: unknown, index: number) => this.edit(kind, tiles => ChartCatalog.remove(tiles, index))
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerSubmenu(ChartMenus.ADD, 'Add Chart');
        menus.registerSubmenu(ChartMenus.SWAP, 'Swap For');
        IDS.forEach((id, order) => {
            menus.registerMenuAction(ChartMenus.ADD, { commandId: ChartMenuContribution.add(id), label: ChartCatalog.label(id), order: String(order) });
            menus.registerMenuAction(ChartMenus.SWAP, { commandId: ChartMenuContribution.swap(id), label: ChartCatalog.label(id), order: String(order) });
        });
        menus.registerMenuAction(ChartMenus.RESET, { commandId: ChartMenuContribution.RESET, label: 'Reset to Default' });
        menus.registerMenuAction(ChartMenus.FORM, { commandId: ChartMenuContribution.SHOW_RATE, label: 'Show as Rate' });
        menus.registerMenuAction(ChartMenus.FORM, { commandId: ChartMenuContribution.SHOW_TOTAL, label: 'Show So Far' });
        menus.registerMenuAction(ChartMenus.MOVE, { commandId: ChartMenuContribution.MOVE_EARLIER, label: 'Move Earlier', order: '0' });
        menus.registerMenuAction(ChartMenus.MOVE, { commandId: ChartMenuContribution.MOVE_LATER, label: 'Move Later', order: '1' });
        menus.registerMenuAction(ChartMenus.REMOVE, { commandId: ChartMenuContribution.REMOVE, label: 'Remove' });
    }

    protected layoutOf(kind: unknown): ChartCatalog.Tile[] {
        return isKind(kind) ? this.layouts.get(kind) : [];
    }

    protected async edit(kind: unknown, change: (tiles: readonly ChartCatalog.Tile[]) => ChartCatalog.Tile[]): Promise<void> {
        if (isKind(kind)) {
            await this.layouts.set(kind, change(this.layouts.get(kind)));
        }
    }
}
