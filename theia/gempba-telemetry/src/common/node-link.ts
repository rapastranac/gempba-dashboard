import URI from '@theia/core/lib/common/uri';
import { URI as CodeUri } from '@theia/core/shared/vscode-uri';

/**
 * A link to one node, e.g. `gempba-node:alpha`, opened through Theia's OpenerService. A view asks to open a
 * node without knowing which view shows it: whichever feature's OpenHandler answers highest does. The hub's own
 * fallback opener answers below any view and opens nothing, so a node link never falls through to Theia's text
 * editor, which claims every URI.
 */
export namespace NodeLink {

    export const SCHEME = 'gempba-node';

    /** What a view that shows nodes answers for a node link; a dedicated node view can answer higher. */
    export const VIEW_PRIORITY = 500;

    /** What the hub's do-nothing opener answers: above Theia's text editor (100), below any view. */
    export const FALLBACK_PRIORITY = 200;

    export function of(host: string): URI {
        return new URI(CodeUri.from({ scheme: SCHEME, path: host }));
    }

    /** The node a link points at, or undefined for any other URI. */
    export function hostOf(uri: URI): string | undefined {
        const host = uri.path.toString();
        return uri.scheme === SCHEME && host.length > 0 ? host : undefined;
    }

    /** An OpenHandler's answer: the given priority for a node link, 0 (declined) for any other URI. */
    export function priority(uri: URI, priority: number): number {
        return hostOf(uri) !== undefined ? priority : 0;
    }
}
