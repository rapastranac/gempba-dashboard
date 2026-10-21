import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { GemPbaAboutDialog } from './gempba-about-dialog';
import { ShellFilterContribution } from './shell-filter-contribution';
import { ShellMenuContribution } from './shell-menu-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(FilterContribution).to(ShellFilterContribution).inSingletonScope();
    bind(MenuContribution).to(ShellMenuContribution).inSingletonScope();
    rebind(AboutDialog).to(GemPbaAboutDialog).inSingletonScope();
});
