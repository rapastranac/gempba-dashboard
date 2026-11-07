import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { GemPbaThemes } from '../common/gempba-themes';

/**
 * Registers GemPBA Dark and GemPBA Light, the app's default color themes. Theia caches them after the first start,
 * so from then on the chosen one applies before the rest of the frontend loads.
 */
@injectable()
export class GemPbaThemeContribution implements FrontendApplicationContribution {

    @inject(MonacoThemingService) protected readonly theming: MonacoThemingService;

    initialize(): void {
        for (const { id, label, uiTheme, json } of GemPbaThemes.ALL) {
            this.theming.registerParsedTheme({ id, label, uiTheme, json });
        }
    }
}
