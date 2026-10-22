import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { NodeLink } from '@gempba/telemetry/lib/common';
import { CardsViewContribution } from './cards-view-contribution';
import { CardsWidget } from './cards-widget';

/** Opens a NodeLink in the Cards view: brings the view to the front with the node picked, expanded and its details shown. */
@injectable()
export class CardsNodeOpener implements OpenHandler {

    readonly id = 'gempba-cards-node-opener';
    readonly label = 'Cards';

    @inject(CardsViewContribution) protected readonly view: CardsViewContribution;

    canHandle(uri: URI): number {
        return NodeLink.priority(uri, NodeLink.VIEW_PRIORITY);
    }

    async open(uri: URI): Promise<CardsWidget | undefined> {
        const host = NodeLink.hostOf(uri);
        if (host === undefined) {
            return undefined;
        }
        const widget = await this.view.openView({ activate: true, reveal: true });
        widget.revealNode(host);
        return widget;
    }
}
