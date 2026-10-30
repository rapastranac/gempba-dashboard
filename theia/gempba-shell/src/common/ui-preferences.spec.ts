import { expect } from 'chai';
import { UiPreferences } from './ui-preferences';

describe('UiPreferences', () => {

    it('shows the settings about the dashboard\'s own UI', () => {
        for (const key of ['workbench.colorTheme', 'window.zoomLevel', 'window.titleBarStyle', 'window.menuBarVisibility', 'window.title',
            'workbench.statusBar.visible', 'workbench.tab.maximize', 'workbench.tree.indent', 'workbench.sash.size', 'notification.timeout',
            'workbench.silentNotifications', 'keyboard.dispatch']) {
            expect(UiPreferences.isShown(key), key).to.equal(true);
        }
    });

    it('hides editor, file, workspace and other IDE settings, and anything not listed', () => {
        for (const key of ['editor.fontSize', 'diffEditor.renderSideBySide', 'files.autoSave', 'files.exclude', 'workspace.preserveWindow',
            'security.workspace.trust.enabled', 'problems.autoReveal', 'http.proxy', 'breadcrumbs.enabled', 'workbench.iconTheme',
            'workbench.editor.highlightModifiedTabs', 'workbench.editorAssociations', 'application.confirmExit', 'window.secondaryWindowPlacement',
            'some.future.setting']) {
            expect(UiPreferences.isShown(key), key).to.equal(false);
        }
    });

    it('shows every GemPBA setting', () => {
        for (const key of ['gempba.telemetry.workerIntervalMs', 'gempba.telemetry.nodeIntervalMs', 'gempba.later.setting']) {
            expect(UiPreferences.isShown(key), key).to.equal(true);
        }
        expect(UiPreferences.isShown('gempbax.setting')).to.equal(false);
    });

    it('also shows the prefixes a contribution adds, but never the hidden window settings', () => {
        expect(UiPreferences.isShown('extensions.onlyShowVerifiedExtensions', ['extensions.'])).to.equal(true);
        expect(UiPreferences.isShown('extensions.onlyShowVerifiedExtensions')).to.equal(false);
        expect(UiPreferences.isShown('window.secondaryWindowPlacement', ['window.'])).to.equal(false);
    });

    it('opens on UI settings only', () => {
        expect(UiPreferences.COMMONLY_USED.filter(key => !UiPreferences.isShown(key))).to.deep.equal([]);
    });
});
