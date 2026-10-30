import { CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { PreferenceDataProperty } from '@theia/core/lib/common/preferences/preference-schema';
import { injectable } from '@theia/core/shared/inversify';
import { PreferenceTreeGenerator } from '@theia/preferences/lib/browser/util/preference-tree-generator';
import { Preference } from '@theia/preferences/lib/browser/util/preference-types';
import { UiPreferences } from '../common/ui-preferences';

/**
 * Builds the Settings page from the UI settings only (see UiPreferences); categories left empty are not shown. The
 * other settings keep their values and defaults, so the code reading them is unaffected.
 */
@injectable()
export class UiPreferenceTreeGenerator extends PreferenceTreeGenerator {

    protected override createBuiltinLeafNode(name: string, property: PreferenceDataProperty, root: CompositeTreeNode,
                                             groups: Map<string, Preference.CompositeTreeNode>): void {
        if (UiPreferences.isShown(name)) {
            super.createBuiltinLeafNode(name, property, root, groups);
        }
    }

    protected override createPluginLeafNode(name: string, property: PreferenceDataProperty, root: CompositeTreeNode,
                                            groups: Map<string, Preference.CompositeTreeNode>): void {
        if (UiPreferences.isShown(name)) {
            super.createPluginLeafNode(name, property, root, groups);
        }
    }
}
