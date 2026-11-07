import { EditorMenuContribution } from '@theia/editor/lib/browser/editor-menu';
import { MonacoEditorMenuContribution } from '@theia/monaco/lib/browser/monaco-menu';
import { WorkspaceSymbolCommand } from '@theia/monaco/lib/browser/workspace-symbol-command';
import { EditMenuContribution, FileMenuContribution } from '@theia/workspace/lib/browser/workspace-commands';
import { ContributionClass } from '../common/shell-contribution';

/**
 * The Theia contributions the shell drops whole: the menus of code editors and workspaces, which also brought the
 * Selection and Go menus, and the workspace-symbol search. Contributions with runtime duties, such as the core one
 * behind File, Edit, View and Help, stay; their IDE commands are in StrippedCommands.
 */
export const STRIPPED_CONTRIBUTIONS: readonly ContributionClass[] = [
    EditorMenuContribution,
    MonacoEditorMenuContribution,
    WorkspaceSymbolCommand,
    FileMenuContribution,
    EditMenuContribution
];
