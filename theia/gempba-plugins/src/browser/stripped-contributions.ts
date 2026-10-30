import { AiCoreCommandContribution } from '@theia/ai-core/lib/browser/ai-core-command-contribution';
import { MCPConfigurationCommandContribution } from '@theia/ai-mcp/lib/browser/mcp-configuration-command-contribution';
import { DebugPrefixConfiguration } from '@theia/debug/lib/browser/debug-prefix-configuration';
import { QuickFileOpenFrontendContribution } from '@theia/file-search/lib/browser/quick-file-open-contribution';
import { NotebookActionsContribution } from '@theia/notebook/lib/browser/contributions/notebook-actions-contribution';
import { NotebookCellActionContribution } from '@theia/notebook/lib/browser/contributions/notebook-cell-actions-contribution';
import { NotebookOutputActionContribution } from '@theia/notebook/lib/browser/contributions/notebook-output-action-contribution';
import { MergeEditorDevContribution } from '@theia/scm/lib/browser/merge-editor/merge-editor-dev-contribution';
import { TaskFrontendContribution } from '@theia/task/lib/browser/task-frontend-contribution';
import { TerminalFrontendContribution } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalQuickOpenContribution } from '@theia/terminal/lib/browser/terminal-quick-open-service';
import { Command } from '@theia/core/lib/common/command';
import { ContributionClass } from '@gempba/shell/lib/common/shell-contribution';

/**
 * What the plugin runtime's packages add that a dashboard has no use for, other than views (the shell's view
 * allowlist drops those). Plugins still get the services behind them, which are injected directly, not through these
 * contributions: a plugin may still run a task or open a terminal, but the dashboard offers neither.
 */
export const STRIPPED_CONTRIBUTIONS: readonly ContributionClass[] = [
    // The Terminal menu, terminal commands and shortcuts.
    TerminalFrontendContribution,
    TerminalQuickOpenContribution,
    // Run Task and the other task commands in the Terminal menu.
    TaskFrontendContribution,
    // "Debug: Select and Start Debugging" and its palette prefix.
    DebugPrefixConfiguration,
    // "File: Open File..." and Ctrl+P.
    QuickFileOpenFrontendContribution,
    // Notebook cell and output commands.
    NotebookActionsContribution,
    NotebookCellActionContribution,
    NotebookOutputActionContribution,
    // The merge editor's developer command.
    MergeEditorDevContribution,
    // AI settings and MCP configuration commands.
    AiCoreCommandContribution,
    MCPConfigurationCommandContribution
];

/**
 * VS Code's labeled editor-group and view-navigation commands that plugin support registers, which would show in the
 * palette. They act on editor groups and views the dashboard doesn't have, and Theia exports no constants for them.
 */
export const STRIPPED_COMMANDS: readonly Command[] = [
    'workbench.action.closeEditorsInGroup',
    'workbench.files.saveAllInGroup',
    'workbench.action.navigateLeft',
    'workbench.action.navigateRight',
    'workbench.action.navigateUp',
    'workbench.action.navigateDown',
    'workbench.action.navigateEditorGroups'
].map(id => ({ id }));
