import '../../src/browser/style/index.css';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ContainerModule } from '@theia/core/shared/inversify';
import { UiColorContribution } from './ui-colors';

export default new ContainerModule(bind => {
    bind(UiColorContribution).toSelf().inSingletonScope();
    bind(ColorContribution).toService(UiColorContribution);
});
