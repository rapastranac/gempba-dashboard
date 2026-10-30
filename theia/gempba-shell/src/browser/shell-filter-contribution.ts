import { injectable } from '@theia/core/shared/inversify';
import { ContributionFilterRegistry, FilterContribution } from '@theia/core/lib/common/contribution-filter';
import { EditorMenuContribution } from '@theia/editor/lib/browser/editor-menu';
import { ProblemContribution } from '@theia/markers/lib/browser/problem/problem-contribution';
import { MonacoEditorMenuContribution } from '@theia/monaco/lib/browser/monaco-menu';
import { WorkspaceSymbolCommand } from '@theia/monaco/lib/browser/workspace-symbol-command';
import { OutlineViewContribution } from '@theia/outline-view/lib/browser/outline-view-contribution';
import { EditMenuContribution, FileMenuContribution } from '@theia/workspace/lib/browser/workspace-commands';

/**
 * Drops the Theia contributions that serve only an IDE: the Outline and Problems views, and the menus of code
 * editors and workspaces, which also brought the Selection and Go menus. Contributions with runtime duties, such as
 * the core one behind File, Edit, View and Help, stay; their IDE commands are removed by ShellCommandStripper.
 */
@injectable()
export class ShellFilterContribution implements FilterContribution {

    registerContributionFilters(registry: ContributionFilterRegistry): void {
        registry.addFilters('*', [
            contribution => !(contribution instanceof OutlineViewContribution),
            contribution => !(contribution instanceof ProblemContribution),
            contribution => !(contribution instanceof EditorMenuContribution),
            contribution => !(contribution instanceof MonacoEditorMenuContribution),
            contribution => !(contribution instanceof WorkspaceSymbolCommand),
            contribution => !(contribution instanceof FileMenuContribution),
            contribution => !(contribution instanceof EditMenuContribution)
        ]);
    }
}
