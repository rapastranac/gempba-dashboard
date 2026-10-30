import { injectable } from '@theia/core/shared/inversify';
import { DEFAULT_LAYOUT, PreferenceLayout, PreferenceLayoutProvider } from '@theia/preferences/lib/browser/util/preference-layout';
import { UiPreferences } from '../common/ui-preferences';

/** Theia's layout has no place for the notification settings, which would otherwise be listed under Extensions. */
const NOTIFICATIONS: PreferenceLayout = { id: 'workbench.notifications', label: 'Notifications', settings: ['notification.*', 'workbench.silentNotifications'] };

/**
 * Opens the Settings page on the dashboard's UI settings, where Theia's Commonly Used lists code-editor ones, and
 * lists the notification settings under Workbench.
 */
@injectable()
export class UiPreferenceLayoutProvider extends PreferenceLayoutProvider {

    protected readonly layout = DEFAULT_LAYOUT.map(section => section.id === 'workbench'
        ? { ...section, children: [...section.children ?? [], NOTIFICATIONS] }
        : section);

    override getLayout(): PreferenceLayout[] {
        return this.layout;
    }

    override getCommonlyUsedLayout(): PreferenceLayout {
        return { ...super.getCommonlyUsedLayout(), settings: UiPreferences.COMMONLY_USED };
    }
}
