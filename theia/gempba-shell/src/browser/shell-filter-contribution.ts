import { injectable } from '@theia/core/shared/inversify';
import { ContributionFilterRegistry, FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { ProblemContribution } from '@theia/markers/lib/browser/problem/problem-contribution';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';

@injectable()
export class ShellFilterContribution implements FilterContribution {

    registerContributionFilters(registry: ContributionFilterRegistry): void {
        registry.addFilters('*', [
            contribution => !(contribution instanceof OutlineViewContribution),
            contribution => !(contribution instanceof ProblemContribution)
        ]);
    }
}
