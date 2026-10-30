import { injectable } from '@theia/core/shared/inversify';
import { DEFAULT_LAYOUT, PreferenceLayout, PreferenceLayoutProvider } from '@theia/preferences/lib/browser/util/preference-layout';
import { UiPreferences } from '../common/ui-preferences';

/** Theia's layout has no place for the notification settings, which would otherwise be listed under Extensions. */
const NOTIFICATIONS: PreferenceLayout = { id: 'workbench.notifications', label: 'Notifications', settings: ['notification.*', 'workbench.silentNotifications'] };
/** GemPBA's own settings, first after Commonly Used, where Theia would list them under Extensions. */
const GEMPBA: PreferenceLayout = { id: 'gempba', label: 'GemPBA', settings: [`${UiPreferences.GEMPBA_PREFIX}*`] };

/**
 * Opens the Settings page on the dashboard's UI settings, where Theia's Commonly Used lists code-editor ones, lists
 * GemPBA's settings in a section of their own, and the notification settings under Workbench.
 */
@injectable()
export class UiPreferenceLayoutProvider extends PreferenceLayoutProvider {

    protected readonly layout = [GEMPBA, ...DEFAULT_LAYOUT.map(section => section.id === 'workbench'
        ? { ...section, children: [...section.children ?? [], NOTIFICATIONS] }
        : section)];

    override getLayout(): PreferenceLayout[] {
        return this.layout;
    }

    override getCommonlyUsedLayout(): PreferenceLayout {
        return { ...super.getCommonlyUsedLayout(), settings: UiPreferences.COMMONLY_USED };
    }
}
