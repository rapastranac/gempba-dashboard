import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { ElectronMainMenuFactory } from '@theia/core/lib/electron-browser/menu/electron-main-menu-factory';
import { MenuDto } from '@theia/core/lib/electron-common/electron-api';
import { inject, injectable } from '@theia/core/shared/inversify';

/**
 * Gives the macOS app menu the dashboard's About dialog, where Theia shows Electron's own About panel, and a
 * Settings… item (Cmd+,), where macOS apps keep it. Services, Hide and Quit stay native.
 */
@injectable()
export class ShellElectronMainMenuFactory extends ElectronMainMenuFactory {

    @inject(CommandRegistry) protected readonly commands: CommandRegistry;

    protected override createOSXMenu(): MenuDto {
        const menu = super.createOSXMenu();
        const name = FrontendApplicationConfigProvider.get().applicationName;
        return {
            ...menu,
            label: name,
            submenu: [
                { label: `About ${name}`, execute: () => this.run(CommonCommands.ABOUT_COMMAND) },
                { type: 'separator' },
                { label: 'Settings…', accelerator: 'Cmd+,', execute: () => this.run(CommonCommands.OPEN_PREFERENCES) },
                ...(menu.submenu ?? []).filter(item => item.role !== 'about')
            ]
        };
    }

    protected run(command: Command): void {
        this.commands.executeCommand(command.id);
    }
}
