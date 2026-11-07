import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import URI from '@theia/core/lib/common/uri';
import { injectable } from '@theia/core/shared/inversify';
import { NodeLink } from '../common/node-link';

/**
 * Opens nothing for a node link when no view shows nodes: it answers above Theia's text editor, which would
 * otherwise try (and fail) to open the link as a file, and below any view that registers for node links.
 */
@injectable()
export class NodeLinkFallbackOpener implements OpenHandler {

    readonly id = 'gempba-node-link-fallback';

    canHandle(uri: URI): number {
        return NodeLink.priority(uri, NodeLink.FALLBACK_PRIORITY);
    }

    open(): undefined {
        return undefined;
    }
}
