import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { injectable } from '@theia/core/shared/inversify';
import { UiColors } from '../common/ui-color-ids';

export { UiColors };

/** Registers the gempba.* theme colors, each following its standard theme color in every kind of theme. */
@injectable()
export class UiColorContribution implements ColorContribution {

    registerColors(colors: ColorRegistry): void {
        colors.register(...UiColors.DEFAULTS.map(([id, follows, description]) => ({
            id,
            description,
            defaults: { dark: follows, light: follows, hcDark: follows, hcLight: follows }
        })));
    }
}
