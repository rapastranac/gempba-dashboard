import { CommonCommands } from '@theia/core/lib/browser/common-commands';
import { PerspectiveServiceImpl } from '@theia/core/lib/browser/perspective-service';
import { Command } from '@theia/core/lib/common/command';
import { EditorCommands } from '@theia/editor/lib/browser/editor-command';
import { FileDownloadCommands } from '@theia/filesystem/lib/browser/download/file-download-command-contribution';
import { FileSystemCommands } from '@theia/filesystem/lib/browser/filesystem-frontend-contribution';
import { PreferencesCommands } from '@theia/preferences/lib/browser/util/preference-types';
import { LIST_VARIABLES } from '@theia/variable-resolver/lib/browser/variable-resolver-frontend-contribution';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';

/**
 * The IDE commands a telemetry dashboard has no use for. Theia's workspace, filesystem, editor and monaco packages
 * stay loaded, because the Settings page and Theia's core need them, so their features are removed by command:
 * the command goes, with its menu items, its palette entry and its shortcut. Each is named by the constant Theia
 * exports for it, so a renamed or removed command fails the build.
 */
export namespace StrippedCommands {

    /** Files: there is nothing to create, open, save or compare. */
    export const FILES: readonly Command[] = [
        CommonCommands.NEW_UNTITLED_TEXT_FILE,
        CommonCommands.NEW_FILE,
        CommonCommands.PICK_NEW_FILE,
        CommonCommands.SAVE,
        CommonCommands.SAVE_ALL,
        CommonCommands.SAVE_WITHOUT_FORMATTING,
        CommonCommands.SAVE_AS,
        CommonCommands.AUTO_SAVE,
        EditorCommands.REVERT_EDITOR,
        EditorCommands.REVERT_AND_CLOSE,
        WorkspaceCommands.NEW_FILE,
        WorkspaceCommands.NEW_FOLDER,
        WorkspaceCommands.FILE_RENAME,
        WorkspaceCommands.FILE_DELETE,
        WorkspaceCommands.FILE_DUPLICATE,
        WorkspaceCommands.FILE_COMPARE,
        FileSystemCommands.UPLOAD,
        FileDownloadCommands.DOWNLOAD,
        FileDownloadCommands.COPY_DOWNLOAD_LINK,
        CommonCommands.COPY_PATH,
        WorkspaceCommands.COPY_RELATIVE_FILE_PATH,
        CommonCommands.SELECT_ICON_THEME
    ];

    /** Workspaces: the dashboard never opens one. */
    export const WORKSPACE: readonly Command[] = [
        WorkspaceCommands.OPEN,
        WorkspaceCommands.OPEN_FILE,
        WorkspaceCommands.OPEN_FOLDER,
        WorkspaceCommands.OPEN_WORKSPACE,
        WorkspaceCommands.OPEN_RECENT_WORKSPACE,
        WorkspaceCommands.SAVE_WORKSPACE_AS,
        WorkspaceCommands.ADD_FOLDER,
        WorkspaceCommands.REMOVE_FOLDER,
        WorkspaceCommands.CLOSE,
        WorkspaceCommands.OPEN_WORKSPACE_FILE,
        WorkspaceCommands.MANAGE_WORKSPACE_TRUST
    ];

    /** Code editors: none is ever shown. */
    export const EDITOR: readonly Command[] = [
        CommonCommands.CLOSE_MAIN_TAB,
        CommonCommands.FIND,
        CommonCommands.REPLACE,
        EditorCommands.SPLIT_EDITOR_RIGHT,
        EditorCommands.SPLIT_EDITOR_LEFT,
        EditorCommands.SPLIT_EDITOR_UP,
        EditorCommands.SPLIT_EDITOR_DOWN,
        EditorCommands.SPLIT_EDITOR_HORIZONTAL,
        EditorCommands.SPLIT_EDITOR_VERTICAL,
        EditorCommands.TOGGLE_WORD_WRAP,
        EditorCommands.TOGGLE_MINIMAP,
        EditorCommands.TOGGLE_RENDER_WHITESPACE,
        EditorCommands.TOGGLE_STICKY_SCROLL,
        CommonCommands.TOGGLE_BREADCRUMBS,
        EditorCommands.GO_BACK,
        EditorCommands.GO_FORWARD,
        EditorCommands.GO_LAST_EDIT,
        EditorCommands.CLEAR_EDITOR_HISTORY,
        EditorCommands.REOPEN_CLOSED_EDITOR,
        EditorCommands.SHOW_ALL_OPENED_EDITORS,
        EditorCommands.CHANGE_LANGUAGE,
        EditorCommands.CHANGE_ENCODING,
        // Theia generates these ids in a loop and exports no constant for them.
        ...['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth']
            .map(ordinal => ({ id: `workbench.action.focus${ordinal}EditorGroup` }))
    ];

    /**
     * Settings are edited on the Settings page only, in the user scope: no settings.json editor, and no second command
     * opening the page on its one scope.
     */
    export const SETTINGS_FILES: readonly Command[] = [
        PreferencesCommands.OPEN_USER_PREFERENCES,
        PreferencesCommands.OPEN_USER_PREFERENCES_JSON,
        PreferencesCommands.OPEN_WORKSPACE_PREFERENCES,
        PreferencesCommands.OPEN_WORKSPACE_PREFERENCES_JSON,
        PreferencesCommands.OPEN_FOLDER_PREFERENCES,
        PreferencesCommands.OPEN_FOLDER_PREFERENCES_JSON,
        PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR
    ];

    /**
     * The rest: no view lives in the bottom panel yet, only English is offered, variables are a debugging aid, and
     * perspectives are an experimental layout feature no view contributes to (Reset Workbench Layout stays).
     */
    export const OTHER: readonly Command[] = [
        CommonCommands.TOGGLE_BOTTOM_PANEL,
        CommonCommands.CONFIGURE_DISPLAY_LANGUAGE,
        LIST_VARIABLES,
        PerspectiveServiceImpl.SWITCH_PERSPECTIVE_COMMAND,
        PerspectiveServiceImpl.RESET_PERSPECTIVE_COMMAND
    ];

    export const ALL: readonly string[] = [...FILES, ...WORKSPACE, ...EDITOR, ...SETTINGS_FILES, ...OTHER].map(command => command.id);
}
