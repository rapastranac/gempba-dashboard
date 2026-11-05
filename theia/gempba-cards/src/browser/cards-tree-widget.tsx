import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { CompositeTreeNode, TreeNode } from '@theia/core/lib/browser/tree/tree';
import { TreeModel } from '@theia/core/lib/browser/tree/tree-model';
import { NodeProps, TREE_NODE_INFO_CLASS, TREE_NODE_SEGMENT_CLASS, TreeProps, TreeWidget } from '@theia/core/lib/browser/tree/tree-widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { MeterBar } from '@gempba/ui/lib/browser';
import { CardsTree, CardsTreeNode } from './cards-tree';

/**
 * The node, socket and rank rows in Theia's own tree, which draws only the rows on screen. The Cards view
 * feeds it snapshots and shows the picked row's details beside it.
 */
@injectable()
export class CardsTreeWidget extends TreeWidget {

    static readonly ID = 'gempba-cards-tree';

    constructor(
        @inject(TreeProps) props: TreeProps,
        @inject(TreeModel) model: TreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
    }

    @postConstruct()
    protected override init(): void {
        super.init();
        this.id = CardsTreeWidget.ID;
        this.addClass('gempba-cards-tree');
        const root: CompositeTreeNode = { id: CardsTree.ROOT_ID, name: '', visible: false, parent: undefined, children: [] };
        this.model.root = root;
    }

    protected override renderIcon(node: TreeNode): React.ReactNode {
        return node.icon ? <span className={`${node.icon} gempba-cards-icon`} /> : undefined;
    }

    /** The name, a small CPU meter, then the caption in Theia's own secondary-text style, like other Theia trees. */
    protected override renderCaption(node: TreeNode, props: NodeProps): React.ReactNode {
        const cpu = CardsTreeNode.is(node) ? node.cpuFraction : undefined;
        return <>
            {super.renderCaption(node, props)}
            {cpu !== undefined && <span className={`${TREE_NODE_SEGMENT_CLASS} gempba-cards-row-meter`}>
                <MeterBar fraction={cpu} tone='cpu' label={`CPU of ${node.name}`} />
            </span>}
            {node.description && <span className={`${TREE_NODE_SEGMENT_CLASS} ${TREE_NODE_INFO_CLASS}`}>{node.description}</span>}
        </>;
    }

    protected override renderTree(model: TreeModel): React.ReactNode {
        if (CompositeTreeNode.is(model.root) && model.root.children.length === 0) {
            return <p className='gempba-cards-empty'>No nodes yet. Listen to a gempba center to see its nodes, sockets and ranks here.</p>;
        }
        return super.renderTree(model);
    }
}
