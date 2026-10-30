import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { GemPbaAboutDialog } from './gempba-about-dialog';
import { ShellCommandStripper } from './shell-command-stripper';
import { ShellFilterContribution } from './shell-filter-contribution';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(FilterContribution).to(ShellFilterContribution).inSingletonScope();
    bind(ShellCommandStripper).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ShellCommandStripper);
    bind(KeybindingContribution).toService(ShellCommandStripper);
    rebind(AboutDialog).to(GemPbaAboutDialog).inSingletonScope();
});
