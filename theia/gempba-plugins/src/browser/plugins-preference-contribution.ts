import { PreferenceContribution, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { injectable } from '@theia/core/shared/inversify';

/**
 * Lists only extensions from verified Open VSX publishers by default, since a plugin runs with the user's rights;
 * the setting stays on the Settings page to list them all.
 */
@injectable()
export class PluginsPreferenceContribution implements PreferenceContribution {

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride('extensions.onlyShowVerifiedExtensions', undefined, true);
    }
}
