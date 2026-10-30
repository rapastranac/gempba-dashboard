import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { PreferenceContribution } from '@theia/core/lib/common/preferences/preference-schema';
import { ContainerModule } from '@theia/core/shared/inversify';
import { AIActivationServiceImpl } from '@theia/ai-core/lib/browser/ai-activation-service';
import { VSXExtensionsViewContainer } from '@theia/vsx-registry/lib/browser/vsx-extensions-view-container';
import { ShellContribution } from '@gempba/shell/lib/common/shell-contribution';
import { ExtensionsLayoutContribution } from './extensions-layout-contribution';
import { InactiveAiActivationService } from './inactive-ai-activation-service';
import { PluginsPreferenceContribution } from './plugins-preference-contribution';
import { StaleThemeCleanup } from './stale-theme-cleanup';
import { STRIPPED_COMMANDS, STRIPPED_CONTRIBUTIONS } from './stripped-contributions';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(ShellContribution).toConstantValue({
        strippedContributions: STRIPPED_CONTRIBUTIONS,
        strippedCommands: STRIPPED_COMMANDS,
        shownViews: [VSXExtensionsViewContainer.ID],
        shownSettings: ['extensions.']
    });
    rebind(AIActivationServiceImpl).to(InactiveAiActivationService).inSingletonScope();
    bind(PreferenceContribution).to(PluginsPreferenceContribution).inSingletonScope();
    bind(FrontendApplicationContribution).to(ExtensionsLayoutContribution).inSingletonScope();
    bind(FrontendApplicationContribution).to(StaleThemeCleanup).inSingletonScope();
});
