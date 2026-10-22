import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { CompositeTreeNode, TreeImpl, TreeNode } from '@theia/core/lib/browser/tree/tree';
import { ExpandableTreeNode } from '@theia/core/lib/browser/tree/tree-expansion';
import { SelectableTreeNode } from '@theia/core/lib/browser/tree/tree-selection';
import { injectable } from '@theia/core/shared/inversify';
import { NodeSnapshot, SocketSnapshot, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { CardsText } from '../common/cards-text';

export type CardsTreeKind = 'node' | 'socket' | 'worker';

/** A row of the Cards tree; `host` ties every row to the node it belongs to. */
export interface CardsTreeNode extends SelectableTreeNode {
    readonly kind: CardsTreeKind;
    readonly host: string;
    readonly socketId?: number;
    readonly workerId?: number;
}

export type CardsGroupNode = CardsTreeNode & ExpandableTreeNode;

export namespace CardsTreeNode {
    export function is(node: unknown): node is CardsTreeNode {
        return SelectableTreeNode.is(node) && typeof (node as CardsTreeNode).kind === 'string' && typeof (node as CardsTreeNode).host === 'string';
    }

    export function nodeId(host: string): string {
        return `node:${host}`;
    }

    export function workerId(host: string, workerId: number): string {
        return `worker:${host}/${workerId}`;
    }
}

/**
 * The Node → Socket → Worker hierarchy, for navigation only: what a row holds is shown beside the tree. It is
 * built lazily from the latest snapshot, as Theia asks for the children of the root and of expanded rows only,
 * so collapsed parts of a large cluster cost nothing. Rows keep their ids from one snapshot to the next, so
 * expansion and selection survive every refresh. Like the Java cards, the first node starts expanded, and so
 * does each node's socket that holds its sentinel worker.
 */
@injectable()
export class CardsTree extends TreeImpl {

    static readonly ROOT_ID = 'gempba-cards-root';

    protected snapshot: WorldSnapshot | undefined;
    protected expandedFirstNode = false;

    setSnapshot(snapshot: WorldSnapshot | undefined): void {
        this.snapshot = snapshot;
    }

    protected override async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        const snapshot = this.snapshot;
        if (!snapshot) {
            return [];
        }
        if (!CardsTreeNode.is(parent)) {
            return snapshot.nodes.map(node => this.nodeRow(parent, node));
        }
        const node = snapshot.nodes.find(candidate => candidate.host === parent.host);
        switch (parent.kind) {
            case 'node':
                return node ? node.sockets.map(each => this.socketRow(parent, node, each)) : [];
            case 'socket': {
                const socket = node?.sockets.find(candidate => candidate.socketId === parent.socketId);
                return socket ? socket.workers.map(each => this.workerRow(parent, parent.host, socket.socketId, each)) : [];
            }
            default:
                return [];
        }
    }

    protected nodeRow(parent: CompositeTreeNode, node: NodeSnapshot): CardsGroupNode {
        const expand = !this.expandedFirstNode;
        const row = this.group(parent, CardsTreeNode.nodeId(node.host), { kind: 'node', host: node.host }, node.host, CardsText.nodeCaption(node), codicon('server'), expand);
        this.expandedFirstNode = true;
        return row;
    }

    protected socketRow(parent: CompositeTreeNode, node: NodeSnapshot, socket: SocketSnapshot): CardsGroupNode {
        const holdsSentinel = socket.workers.some(worker => worker.workerId === node.sentinelWorkerId);
        return this.group(parent, `socket:${node.host}/${socket.socketId}`, { kind: 'socket', host: node.host, socketId: socket.socketId },
            CardsText.socketTitle(socket), CardsText.socketCaption(socket), codicon('circuit-board'), holdsSentinel);
    }

    protected workerRow(parent: CompositeTreeNode, host: string, socketId: number, worker: WorkerSnapshot): CardsTreeNode {
        const id = CardsTreeNode.workerId(host, worker.workerId);
        const name = CardsText.workerTitle(worker);
        const description = CardsText.workerCaption(worker);
        const icon = codicon(worker.sentinel ? 'star-full' : 'gear');
        const existing = this.getNode(id);
        if (CardsTreeNode.is(existing)) {
            return Object.assign(existing, { parent, name, description, icon });
        }
        const row: CardsTreeNode = { id, parent, name, description, icon, kind: 'worker', host, socketId, workerId: worker.workerId, visible: true, selected: false };
        return row;
    }

    /** Reuses the row with this id when there is one, so a refresh keeps it expanded or selected. */
    protected group(parent: CompositeTreeNode, id: string, keys: Pick<CardsTreeNode, 'kind' | 'host' | 'socketId'>,
        name: string, description: string, icon: string, expandedByDefault: boolean): CardsGroupNode {
        const existing = this.getNode(id);
        if (CardsTreeNode.is(existing) && ExpandableTreeNode.is(existing)) {
            return Object.assign(existing, { parent, name, description, icon });
        }
        const row: CardsGroupNode = { id, parent, name, description, icon, ...keys, visible: true, selected: false, expanded: expandedByDefault, children: [] };
        return row;
    }
}
