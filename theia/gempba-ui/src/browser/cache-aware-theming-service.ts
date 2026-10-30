import { Disposable } from '@theia/core/lib/common/disposable';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { injectable } from '@theia/core/shared/inversify';
import { getThemes, MonacoThemeState } from '@theia/monaco/lib/browser/monaco-indexed-db';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { StaleThemes } from '../common/stale-themes';

/**
 * Theia's theming service, where a theme registered this session always wins over its cached copy, and which keeps
 * the registration of each theme it restores from the cache, so that the themes of uninstalled plugins can be dropped.
 *
 * Theia caches every registered theme so that the remembered one applies before the themes are registered again, and
 * restores the whole cache at each start. Both reads can finish after the UI kit has registered its own themes, which
 * would then show, and be cached again, as an earlier version of the app left them.
 */
@injectable()
export class CacheAwareThemingService extends MonacoThemingService {

    /** The themes registered this session, by id; each is newer than its cached copy. */
    protected readonly registered = new Map<string, MonacoThemeState>();
    protected readonly restored = new Map<string, Disposable>();
    protected readonly restoreDone = new Deferred<void>();

    override initialize(): void {
        super.initialize();
        // runs after Theia's own listener, which applies the cached copy of the remembered theme
        this.themeService.onDidRetrieveTheme(cached => this.reapply(cached.id));
    }

    /**
     * Unregisters and uncaches the restored themes that nothing registered again and no installed plugin declares,
     * and returns their ids. Theia falls back to the default theme if one of them was active.
     */
    async dropStale(declared: ReadonlySet<string>): Promise<string[]> {
        await this.restoreDone.promise;
        const stale = StaleThemes.of(this.restored.keys(), new Set(this.registered.keys()), declared);
        for (const id of stale) {
            this.restored.get(id)?.dispose();
            this.restored.delete(id);
        }
        return stale;
    }

    /** Registers a theme read from code or a plugin; the restore below registers cached ones through Theia's method. */
    protected override doRegisterParsedTheme(state: MonacoThemeState): Disposable {
        this.registered.set(state.id, state);
        return super.doRegisterParsedTheme(state);
    }

    /** Theia's restore, skipping the themes registered this session, and keeping each restored theme's registration. */
    protected override async restore(): Promise<void> {
        try {
            for (const state of await getThemes()) {
                if (!this.registered.has(state.id)) {
                    this.monacoThemeRegistry.setTheme(state.data.name!, state.data);
                    this.restored.set(state.id, super.doRegisterParsedTheme(state));
                }
            }
        } catch (e) {
            this.logger.error('Failed to restore monaco themes', e);
        } finally {
            this.restoreDone.resolve();
        }
    }

    /** Applies the colors of the theme registered this session under `id` again, if there is one. */
    protected reapply(id: string): void {
        const state = this.registered.get(id);
        if (state) {
            this.monacoThemeRegistry.setTheme(state.data.name!, state.data);
        }
    }
}
