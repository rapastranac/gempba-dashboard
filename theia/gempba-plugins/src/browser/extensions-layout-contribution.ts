import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import { VSXExtensionsContribution } from '@theia/vsx-registry/lib/browser/vsx-extensions-contribution';

/**
 * Adds the Extensions view to a restored layout that lacks it (one saved before plugin support was installed);
 * Theia opens it only on a fresh layout.
 */
@injectable()
export class ExtensionsLayoutContribution implements FrontendApplicationContribution {

    @inject(VSXExtensionsContribution) protected readonly extensions: VSXExtensionsContribution;

    async onDidInitializeLayout(): Promise<void> {
        if (!this.extensions.tryGetWidget()) {
            await this.extensions.openView({ activate: false, reveal: false });
        }
    }
}
