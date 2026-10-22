import { SplitWidget } from '@theia/core/lib/browser/widgets/split-widget';
import { codicon, Message } from '@theia/core/lib/browser/widgets/widget';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { WorldSnapshot } from '@gempba/core';
import { NodeSelection, TelemetryService } from '@gempba/telemetry/lib/common';
import { VisibleRefresh } from '@gempba/ui/lib/browser';
import { CardsDetailsWidget } from './cards-details-widget';
import { CardsTree, CardsTreeNode } from './cards-tree';
import { CardsTreeWidget } from './cards-tree-widget';

/**
 * The Cards view: Theia's split widget with the node, socket and worker tree on the left and the picked row's
 * details on the right. It follows the node picked in any view and publishes the node of the row picked here.
 * When nothing is picked yet it picks the first node's sentinel worker, as the Java cards opened it. Hidden (a
 * background tab, or a minimized window) it does no work, and only expanded rows are ever built.
 */
export class CardsWidget extends SplitWidget {

    static readonly ID = 'gempba-cards';
    static readonly LABEL = 'Cards';

    /** The snapshot the tree and the details were last built from. */
    protected snapshot: WorldSnapshot | undefined;
    /** The node picked elsewhere, applied once its row exists. */
    protected followHost: string | undefined;
    /** Whether a row was ever picked, by the user, by another view, or by default. */
    protected picked = false;

    constructor(
        protected readonly tree: CardsTreeWidget,
        protected readonly cardsTree: CardsTree,
        protected readonly details: CardsDetailsWidget,
        protected readonly telemetry: TelemetryService,
        protected readonly selection: SelectionService
    ) {
        super({ orientation: 'horizontal' });
        this.id = CardsWidget.ID;
        this.title.label = CardsWidget.LABEL;
        this.title.caption = 'GemPBA nodes, sockets and workers';
        this.title.iconClass = codicon('list-tree');
        this.title.closable = false;
        this.addClass('gempba-cards');
        this.addPane(tree);
        this.addPane(details);
        this.setRelativeSizes([2, 3]);

        const refresh = new VisibleRefresh(this, () => this.refresh());
        this.toDispose.push(refresh);
        this.toDispose.push(telemetry.onSnapshot(() => refresh.request()));
        this.toDispose.push(telemetry.onStateChange(() => refresh.request()));
        this.toDispose.push(selection.onSelectionChanged(current => {
            if (NodeSelection.is(current) && current.host !== this.pickedRow()?.host) {
                this.followHost = current.host;
                refresh.request();
            }
        }));
        this.toDispose.push(tree.model.onSelectionChanged(() => this.onPicked()));
        refresh.request();
    }

    /** Reads the latest snapshot only now, so a hidden view never touches one. */
    protected async refresh(): Promise<void> {
        this.snapshot = this.telemetry.snapshot;
        this.cardsTree.setSnapshot(this.snapshot);
        await this.tree.model.refresh();
        this.pickRow();
        this.details.showDetails(this.snapshot, this.pickedRow());
    }

    /** Picks the node another view picked, or else the first node's sentinel worker once, when nothing is picked. */
    protected pickRow(): void {
        const host = this.followHost;
        if (host !== undefined) {
            const row = this.tree.model.getNode(CardsTreeNode.nodeId(host));
            if (CardsTreeNode.is(row)) {
                this.followHost = undefined;
                this.picked = true;
                this.tree.model.selectNode(row);
            }
            return;
        }
        if (this.picked || this.pickedRow()) {
            this.picked = true;
            return;
        }
        const first = this.snapshot?.nodes[0];
        const sentinel = first && this.tree.model.getNode(CardsTreeNode.workerId(first.host, first.sentinelWorkerId));
        if (CardsTreeNode.is(sentinel)) {
            this.picked = true;
            this.tree.model.selectNode(sentinel);
        }
    }

    protected onPicked(): void {
        const row = this.pickedRow();
        this.details.showDetails(this.snapshot, row);
        const current = this.selection.selection;
        if (row && !(NodeSelection.is(current) && current.host === row.host)) {
            this.selection.selection = NodeSelection.of(row.host);
        }
    }

    protected pickedRow(): CardsTreeNode | undefined {
        const selected = this.tree.model.selectedNodes[0];
        return CardsTreeNode.is(selected) ? selected : undefined;
    }

    /** Keeps only the pane sizes: the panes are this view's own, not widgets the layout should recreate. */
    override storeState(): SplitWidget.State {
        return { widgets: [], relativeSizes: this.relativeSizes() };
    }

    override restoreState(state: SplitWidget.State): void {
        if (state.relativeSizes?.length === 2) {
            this.setRelativeSizes(state.relativeSizes);
        }
    }

    protected override onActivateRequest(message: Message): void {
        this.tree.activate();
    }
}
