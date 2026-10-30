import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { ContributionFilterRegistry, FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { injectable, multiInject } from '@theia/core/shared/inversify';
import { ShellContribution } from '../common/shell-contribution';
import { ShellViews } from '../common/shell-views';

/**
 * Drops the Theia contributions that serve only an IDE: every view outside the allowlist (ShellViews and the views
 * each ShellContribution keeps), such as Outline and Problems, and the contributions each ShellContribution strips.
 */
@injectable()
export class ShellFilterContribution implements FilterContribution {

    @multiInject(ShellContribution) protected readonly contributions: readonly ShellContribution[];

    registerContributionFilters(registry: ContributionFilterRegistry): void {
        const shownViews = this.contributions.flatMap(contribution => contribution.shownViews ?? []);
        const stripped = this.contributions.flatMap(contribution => contribution.strippedContributions ?? []);
        registry.addFilters('*', [
            contribution => !(contribution instanceof AbstractViewContribution) || ShellViews.isShown(contribution.viewId, shownViews),
            contribution => !stripped.some(type => contribution instanceof type)
        ]);
    }
}
