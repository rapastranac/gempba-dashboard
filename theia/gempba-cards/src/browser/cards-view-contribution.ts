import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { Command, CommandHandler, CommandRegistry } from '@theia/core/lib/common/command';
import { injectable } from '@theia/core/shared/inversify';
import { CardsWidget } from './cards-widget';

export namespace CardsCommands {
    export const EXPAND_SELECTED: Command = { id: 'gempba.cards.expandSelected', category: 'Cards', label: 'Expand Selected', iconClass: codicon('expand-all') };
    export const COLLAPSE_ALL: Command = { id: 'gempba.cards.collapseAll', category: 'Cards', label: 'Collapse All', iconClass: codicon('collapse-all') };
}

/**
 * Puts the Cards view in the main area as a tab beside the Grid, with a View-menu entry. It is opened on a fresh
 * layout and added to a restored one that lacks it, without taking the front from the tab already shown. Like
 * Theia's own trees, its tab carries Expand Selected and Collapse All buttons, also in the command palette.
 */
@injectable()
export class CardsViewContribution extends AbstractViewContribution<CardsWidget> implements FrontendApplicationContribution, TabBarToolbarContribution {

    constructor() {
        super({
            widgetId: CardsWidget.ID,
            widgetName: CardsWidget.LABEL,
            defaultWidgetOptions: { area: 'main' },
            toggleCommandId: 'gempba.cards.toggle'
        });
    }

    async initializeLayout(): Promise<void> {
        await this.openView({ activate: false, reveal: false });
    }

    async onDidInitializeLayout(): Promise<void> {
        if (!this.tryGetWidget()) {
            await this.openView({ activate: false, reveal: false });
        }
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(CardsCommands.EXPAND_SELECTED, this.onCards(cards => cards.expandSelected()));
        commands.registerCommand(CardsCommands.COLLAPSE_ALL, this.onCards(cards => cards.collapseAll()));
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({ id: CardsCommands.EXPAND_SELECTED.id, command: CardsCommands.EXPAND_SELECTED.id, tooltip: CardsCommands.EXPAND_SELECTED.label, priority: 0 });
        toolbar.registerItem({ id: CardsCommands.COLLAPSE_ALL.id, command: CardsCommands.COLLAPSE_ALL.id, tooltip: CardsCommands.COLLAPSE_ALL.label, priority: 1 });
    }

    /** A toolbar passes the widget its tab shows; the palette passes nothing, so the Cards view is looked up. */
    protected onCards(run: (cards: CardsWidget) => Promise<void>): CommandHandler {
        const cards = (widget?: unknown) => widget === undefined ? this.tryGetWidget() : widget instanceof CardsWidget ? widget : undefined;
        return {
            execute: async widget => {
                const target = cards(widget);
                if (target) {
                    await run(target);
                }
            },
            isEnabled: widget => cards(widget) !== undefined,
            isVisible: widget => cards(widget) !== undefined
        };
    }
}
