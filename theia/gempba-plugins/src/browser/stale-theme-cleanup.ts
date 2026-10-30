import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ILogger } from '@theia/core/lib/common/logger';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { PluginIdentifiers } from '@theia/plugin-ext/lib/common/plugin-identifiers';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { StaleThemes } from '../common/stale-themes';
import { StaleThemeAwareThemingService } from './stale-theme-aware-theming-service';

/** The setting holding the color theme; Theia does not export its key. */
const COLOR_THEME = 'workbench.colorTheme';

/**
 * Once the installed plugins have started, drops the cached color themes of plugins that were uninstalled, which
 * Theia would otherwise keep selectable and active, and resets the color theme setting if it names one of them, so
 * the default theme applies.
 */
@injectable()
export class StaleThemeCleanup implements FrontendApplicationContribution {

    @inject(HostedPluginSupport) protected readonly pluginSupport: HostedPluginSupport;
    @inject(StaleThemeAwareThemingService) protected readonly theming: StaleThemeAwareThemingService;
    @inject(PreferenceService) protected readonly preferences: PreferenceService;
    @inject(ILogger) @named('gempba:StaleThemeCleanup') protected readonly logger: ILogger;

    onStart(): void {
        this.cleanUp().catch(error => this.logger.error('Could not drop the color themes of uninstalled plugins', error));
    }

    protected async cleanUp(): Promise<void> {
        await this.pluginSupport.didStart;
        const declared = new Set(this.pluginSupport.plugins.flatMap(metadata => {
            const plugin = this.pluginSupport.getPlugin(PluginIdentifiers.componentsToUnversionedId(metadata.model));
            return (plugin?.contributes?.themes ?? []).map(StaleThemes.idOf);
        }));
        const stale = await this.theming.dropStale(declared);
        const configured = this.preferences.get<string>(COLOR_THEME);
        if (configured !== undefined && stale.includes(configured)) {
            await this.preferences.set(COLOR_THEME, undefined, PreferenceScope.User);
        }
        if (stale.length > 0) {
            this.logger.info(`Dropped the color themes of uninstalled plugins: ${stale.join(', ')}`);
        }
    }
}
