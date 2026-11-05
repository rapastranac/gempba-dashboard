import { CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { ExpandableTreeNode } from '@theia/core/lib/browser/tree/tree-expansion';
import { SplitWidget } from '@theia/core/lib/browser/widgets/split-widget';
import { codicon, Message, Widget } from '@theia/core/lib/browser/widgets/widget';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { WorldSnapshot } from '@gempba/core';
import { LiveTelemetryView } from '@gempba/telemetry/lib/browser';
import { NodeSelection, TelemetryService } from '@gempba/telemetry/lib/common';
import { VisibleRefresh } from '@gempba/ui/lib/browser';
import { CardsDetailsWidget } from './cards-details-widget';
import { CardsTree, CardsTreeNode } from './cards-tree';
import { CardsTreeWidget } from './cards-tree-widget';

/**
 * The Cards view: Theia's split widget with the node, socket and rank tree on the left and the picked row's
 * details on the right. It follows the node picked in any view and publishes the node of the row picked here.
 * When nothing is picked yet it picks the first node's sentinel rank, as the Java cards opened it. Hidden (a
 * background tab, or a minimized window) it does no work, and only expanded rows are ever built. A node opened
 * from another view (see {@link revealNode}) is picked and expanded.
 */
export class CardsWidget extends SplitWidget {

    static readonly ID = 'gempba-cards';
    static readonly LABEL = 'Cards';
    /** The tree takes a third, room for a row's name, meter and caption; the panel the rest, room for its three charts side by side. */
    static readonly DEFAULT_SIZES: readonly number[] = [1, 2];

    /** The snapshot the tree and the details were last built from. */
    protected snapshot: WorldSnapshot | undefined;
    /** The node picked elsewhere, applied once its row exists. */
    protected followHost: string | undefined;
    /** Whether the followed node is also expanded, as when it was opened rather than only picked. */
    protected expandFollowed = false;
    /** Whether a row was ever picked, by the user, by another view, or by default. */
    protected picked = false;
    protected readonly refreshes: VisibleRefresh;
    /**
     * The pane sizes to apply once the view has a width: the split scales sizes to its width on its first layout, so
     * sizes set while the view is hidden, as at startup behind another tab, are lost and the panes split evenly.
     */
    protected pendingSizes: readonly number[] | undefined = CardsWidget.DEFAULT_SIZES;

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
        this.title.caption = 'GemPBA nodes, sockets and ranks';
        this.title.iconClass = codicon('list-tree');
        this.title.closable = false;
        this.addClass('gempba-cards');
        LiveTelemetryView.mark(this);
        this.addPane(tree);
        this.addPane(details);

        const refresh = this.refreshes = new VisibleRefresh(this, () => this.refresh());
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

    /** Picks and expands a node's row, showing its details, once the row exists. */
    revealNode(host: string): void {
        this.followHost = host;
        this.expandFollowed = true;
        this.refreshes.request();
    }

    /** Expands the picked row and every row below it; does nothing when the picked row has no children. */
    async expandSelected(): Promise<void> {
        const row = this.pickedRow();
        if (ExpandableTreeNode.is(row)) {
            await this.expandBelow(row.id);
        }
    }

    /** Folds the tree back to its node rows; a picked row that gets hidden passes the pick to its node. */
    async collapseAll(): Promise<void> {
        const root = this.tree.model.root;
        if (CompositeTreeNode.is(root)) {
            await this.tree.model.collapseAll(root);
        }
    }

    /** Rows are built only when expanded, so each level is read back by id once its parent has expanded. */
    protected async expandBelow(id: string): Promise<void> {
        const row = this.tree.model.getNode(id);
        if (!ExpandableTreeNode.is(row)) {
            return;
        }
        await this.tree.model.expandNode(row);
        const expanded = this.tree.model.getNode(id);
        if (CompositeTreeNode.is(expanded)) {
            for (const child of expanded.children) {
                await this.expandBelow(child.id);
            }
        }
    }

    /** Reads the latest snapshot only now, so a hidden view never touches one. */
    protected async refresh(): Promise<void> {
        this.snapshot = this.telemetry.snapshot;
        this.cardsTree.setSnapshot(this.snapshot);
        await this.tree.model.refresh();
        this.pickRow();
        this.details.showDetails(this.snapshot, this.pickedRow());
    }

    /** Picks the node another view picked, or else the first node's sentinel rank once, when nothing is picked. */
    protected pickRow(): void {
        const host = this.followHost;
        if (host !== undefined) {
            const row = this.tree.model.getNode(CardsTreeNode.nodeId(host));
            if (CardsTreeNode.is(row)) {
                this.followHost = undefined;
                this.picked = true;
                this.tree.model.selectNode(row);
                if (this.expandFollowed && ExpandableTreeNode.is(row)) {
                    this.tree.model.expandNode(row);
                }
                this.expandFollowed = false;
            }
            return;
        }
        if (this.picked || this.pickedRow()) {
            this.picked = true;
            return;
        }
        const first = this.snapshot?.nodes[0];
        const sentinel = first && this.tree.model.getNode(CardsTreeNode.rankId(first.host, first.sentinelRank));
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
            this.pendingSizes = state.relativeSizes;
            this.applyPendingSizes();
        }
    }

    protected override onAfterShow(message: Message): void {
        super.onAfterShow(message);
        this.applyPendingSizes();
    }

    protected override onResize(message: Widget.ResizeMessage): void {
        super.onResize(message);
        this.applyPendingSizes();
    }

    protected applyPendingSizes(): void {
        if (this.pendingSizes && this.node.offsetWidth > 0) {
            this.setRelativeSizes([...this.pendingSizes]);
            this.pendingSizes = undefined;
        }
    }

    protected override onActivateRequest(message: Message): void {
        this.tree.activate();
    }
}
