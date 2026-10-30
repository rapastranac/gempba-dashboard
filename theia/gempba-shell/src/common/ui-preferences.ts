/**
 * Which settings the Settings page shows: those about the dashboard's own UI. An allowlist, so the editor, file and
 * workspace settings Theia's packages register stay off the page, and so do any a later Theia version adds. A hidden
 * setting keeps its value and default; it is only not offered for editing.
 */
export namespace UiPreferences {

    const SHOWN = [
        'workbench.colorTheme',
        'workbench.statusBar.visible',
        'workbench.silentNotifications',
        'workbench.commandPalette.history',
        'workbench.hover.delay',
        'keyboard.dispatch'
    ];
    const SHOWN_PREFIXES = ['window.', 'workbench.tab.', 'workbench.tree.', 'workbench.sash.', 'notification.'];
    /** Window settings for moving a view to a window of its own, which the dashboard offers no way to do. */
    const HIDDEN_PREFIXES = ['window.secondaryWindow'];

    /** The settings a fresh Settings page opens on, instead of Theia's code-editor ones. */
    export const COMMONLY_USED = [
        'workbench.colorTheme',
        'window.zoomLevel',
        'window.titleBarStyle',
        'window.menuBarVisibility',
        'workbench.statusBar.visible',
        'notification.timeout'
    ];

    export function isShown(key: string): boolean {
        if (HIDDEN_PREFIXES.some(prefix => key.startsWith(prefix))) {
            return false;
        }
        return SHOWN.includes(key) || SHOWN_PREFIXES.some(prefix => key.startsWith(prefix));
    }
}
