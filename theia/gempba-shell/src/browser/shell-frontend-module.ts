import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { AboutDialog } from '@theia/core/lib/browser/about-dialog';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { KeybindingContribution } from '@theia/core/lib/browser/keybinding';
import { FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { PreferenceLayoutProvider } from '@theia/preferences/lib/browser/util/preference-layout';
import { PreferenceTreeGenerator } from '@theia/preferences/lib/browser/util/preference-tree-generator';
import { PreferencesWidget } from '@theia/preferences/lib/browser/views/preference-widget';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { ShellContribution } from '../common/shell-contribution';
import { GemPbaAboutDialog } from './gempba-about-dialog';
import { ShellCommandStripper } from './shell-command-stripper';
import { ShellFilterContribution } from './shell-filter-contribution';
import { ShellWorkspaceService } from './shell-workspace-service';
import { StrippedCommands } from './stripped-commands';
import { STRIPPED_CONTRIBUTIONS } from './stripped-contributions';
import { UiPreferenceLayoutProvider } from './ui-preference-layout-provider';
import { UiPreferenceTreeGenerator } from './ui-preference-tree-generator';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(ShellContribution).toConstantValue({
        strippedContributions: STRIPPED_CONTRIBUTIONS,
        strippedCommands: StrippedCommands.ALL,
        shownViews: [PreferencesWidget.ID]
    });
    bind(FilterContribution).to(ShellFilterContribution).inSingletonScope();
    bind(ShellCommandStripper).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ShellCommandStripper);
    bind(KeybindingContribution).toService(ShellCommandStripper);
    rebind(AboutDialog).to(GemPbaAboutDialog).inSingletonScope();
    rebind(PreferenceTreeGenerator).to(UiPreferenceTreeGenerator).inSingletonScope();
    rebind(PreferenceLayoutProvider).to(UiPreferenceLayoutProvider).inSingletonScope();
    rebind(WorkspaceService).to(ShellWorkspaceService).inSingletonScope();
});
