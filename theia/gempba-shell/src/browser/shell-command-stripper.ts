import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ILogger } from '@theia/core/lib/common/logger';
import { MenuModelRegistry } from '@theia/core/lib/common/menu/menu-model-registry';
import { isWindows } from '@theia/core/lib/common/os';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { StrippedCommands } from './stripped-commands';

/**
 * Removes the IDE commands once every contribution has registered its own, and their palette entries and shortcuts
 * go with them. Their menu items are removed too, since a handler Monaco adds separately (as for Find) keeps an item
 * on show. A listed command that is not registered is logged, since a newer Theia may have replaced it with one the
 * list does not name. On Windows it also frees Ctrl+W, which Theia binds to closing the whole window; Close Window
 * stays in the File menu, and Alt+F4 still closes the window.
 */
@injectable()
export class ShellCommandStripper implements FrontendApplicationContribution, KeybindingContribution {

    @inject(CommandRegistry) protected readonly commands: CommandRegistry;
    @inject(MenuModelRegistry) protected readonly menus: MenuModelRegistry;
    @inject(ILogger) @named('gempba:ShellCommandStripper') protected readonly logger: ILogger;

    onStart(): void {
        for (const id of StrippedCommands.ALL) {
            if (!this.commands.getCommand(id)) {
                this.logger.warn(`Command ${id} is not registered, so there is nothing to strip: a newer Theia may have replaced it`);
            }
            this.commands.unregisterCommand(id);
            this.menus.unregisterMenuAction(id);
        }
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        if (isWindows) {
            keybindings.unregisterKeybinding({ command: 'close.window', keybinding: 'ctrl+w' });
        }
    }
}
