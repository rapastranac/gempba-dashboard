import { Disposable } from '@theia/core/lib/common/disposable';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable } from '@theia/core/shared/inversify';
import { getThemes } from '@theia/monaco/lib/browser/monaco-indexed-db';
import { MonacoThemeJson, MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { StaleThemes } from '../common/stale-themes';

/**
 * Theia's theming service, also keeping the registration of each theme it restores from its cache at startup, and
 * which themes were registered again this session, so that the themes of uninstalled plugins can be dropped.
 */
@injectable()
export class StaleThemeAwareThemingService extends MonacoThemingService {

    protected readonly restored = new Map<string, Disposable>();
    protected readonly registered = new Set<string>();
    protected readonly restoreDone = new Deferred<void>();

    override registerParsedTheme(theme: MonacoThemeJson): Disposable {
        this.registered.add(theme.id || theme.label);
        return super.registerParsedTheme(theme);
    }

    /**
     * Unregisters and uncaches the restored themes that nothing registered again and no installed plugin declares,
     * and returns their ids. Theia falls back to the default theme if one of them was active.
     */
    async dropStale(declared: ReadonlySet<string>): Promise<string[]> {
        await this.restoreDone.promise;
        const stale = StaleThemes.of(this.restored.keys(), this.registered, declared);
        for (const id of stale) {
            this.restored.get(id)?.dispose();
            this.restored.delete(id);
        }
        return stale;
    }

    /** Theia's restore, keeping each restored theme's registration, whose disposal also removes it from the cache. */
    protected override async restore(): Promise<void> {
        try {
            for (const state of await getThemes()) {
                this.monacoThemeRegistry.setTheme(state.data.name!, state.data);
                this.restored.set(state.id, this.doRegisterParsedTheme(state));
            }
        } catch (e) {
            this.logger.error('Failed to restore monaco themes', e);
        } finally {
            this.restoreDone.resolve();
        }
    }
}
