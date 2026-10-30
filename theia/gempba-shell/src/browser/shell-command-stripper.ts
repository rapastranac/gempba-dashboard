import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { BOTTOM_PANEL_TOGGLE_ID } from '@theia/core/lib/browser/shell/application-shell';
import { StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ILogger } from '@theia/core/lib/common/logger';
import { MenuModelRegistry } from '@theia/core/lib/common/menu/menu-model-registry';
import { isWindows } from '@theia/core/lib/common/os';
import { inject, injectable, multiInject, named } from '@theia/core/shared/inversify';
import { ShellContribution } from '../common/shell-contribution';

/**
 * Removes the commands every ShellContribution lists, once all contributions have registered theirs; their palette
 * entries and shortcuts go with them. Their menu items are removed too, since a handler Monaco adds separately (as
 * for Find) keeps an item on show. A listed command that is not registered is logged, since a newer Theia may have
 * replaced it with one the list does not name. The bottom panel's status-bar button goes too, since its command is
 * stripped and no view lives there. On Windows it also frees Ctrl+W, which Theia binds to closing the whole window;
 * Close Window stays in the File menu, and Alt+F4 still closes the window.
 */
@injectable()
export class ShellCommandStripper implements FrontendApplicationContribution, KeybindingContribution {

    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(ILogger) @named('gempba:ShellCommandStripper') protected readonly logger: ILogger;
    @multiInject(ShellContribution) protected readonly contributions: readonly ShellContribution[];

    onStart(): void {
        for (const { id } of this.contributions.flatMap(contribution => contribution.strippedCommands ?? [])) {
            if (!this.commands.getCommand(id)) {
                this.logger.warn(`Command ${id} is not registered, so there is nothing to strip: a newer Theia may have replaced it`);
            }
            this.commands.unregisterCommand(id);
            this.menus.unregisterMenuAction(id);
        }
        this.statusBar.removeElement(BOTTOM_PANEL_TOGGLE_ID);
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        if (isWindows) {
            keybindings.unregisterKeybinding({ command: 'close.window', keybinding: 'ctrl+w' });
        }
    }
}
