import { ContainerModule } from '@theia/core/shared/inversify';
import { FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { ShellFilterContribution } from './shell-filter-contribution';
import { ShellMenuContribution } from './shell-menu-contribution';

export default new ContainerModule(bind => {
    bind(FilterContribution).to(ShellFilterContribution).inSingletonScope();
    bind(MenuContribution).to(ShellMenuContribution).inSingletonScope();
});
