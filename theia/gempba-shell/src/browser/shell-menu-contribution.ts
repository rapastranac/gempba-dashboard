import { injectable } from '@theia/core/shared/inversify';
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';

const SELECTION_MENU_ID = '3_selection';
const GO_MENU_ID = '5_go';

@injectable()
export class ShellMenuContribution implements MenuContribution {

    registerMenus(menus: MenuModelRegistry): void {
        menus.unregisterMenuAction(SELECTION_MENU_ID, MAIN_MENU_BAR);
        menus.unregisterMenuAction(GO_MENU_ID, MAIN_MENU_BAR);
    }
}
