import '../../src/browser/style/index.css';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ContainerModule } from '@theia/core/shared/inversify';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { CacheAwareThemingService } from './cache-aware-theming-service';
import { UiColorContribution } from './ui-colors';

export default new ContainerModule((bind, _unbind, _isBound, rebind) => {
    bind(UiColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(UiColorContribution);
    bind(CacheAwareThemingService).toSelf().inSingletonScope();
    rebind(MonacoThemingService).toService(CacheAwareThemingService);
});
