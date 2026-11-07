import URI from '@theia/core/lib/common/uri';

/** A color theme a plugin declares, as Theia normalizes it. */
export interface DeclaredTheme {
    readonly id?: string;
    readonly label?: string;
    readonly uri: string;
}

/**
 * Which cached color themes are stale. Theia caches every registered theme so that the active one applies before
 * plugins load, and restores the whole cache at each start; without this, a theme whose plugin was uninstalled
 * stays selectable, and stays active if it was.
 */
export namespace StaleThemes {

    /** The id Theia registers a plugin's theme under: its id, else its label, else its file name. */
    export function idOf(theme: DeclaredTheme): string {
        return theme.id || theme.label || new URI(theme.uri).path.base;
    }

    /** The cached themes nothing registered again this session and no installed plugin declares. */
    export function of(cached: Iterable<string>, registered: ReadonlySet<string>, declared: ReadonlySet<string>): string[] {
        return [...cached].filter(id => !registered.has(id) && !declared.has(id));
    }
}
