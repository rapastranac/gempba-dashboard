import { Schema1Topology } from './schema1-lines';
import { MockShape } from '../../common/mock-config';

const GiB = 1024 ** 3;

export interface MockSocketPlace {
    readonly socketId: number;
    readonly name: string;
    readonly physicalCores: number;
    readonly logicalCores: number;
    /** Ascending, as hwloc lists them. */
    readonly cpuIds: readonly number[];
}

export interface MockNodePlace {
    readonly host: string;
    readonly index: number;
    readonly physicalCores: number;
    readonly logicalCores: number;
    readonly memTotalBytes: number;
    readonly sockets: readonly MockSocketPlace[];
}

export interface MockRankPlace {
    readonly id: number;
    readonly nodeIndex: number;
    readonly socketId: number;
    /** Disjoint slices of the socket's CPUs, whole cores at a time. */
    readonly allowedCpuIds: readonly number[];
    readonly poolThreads: number;
}

/**
 * Where everything sits in a mocked cluster: nodes named `mock-host-01`…, their sockets and CPUs, and the workers
 * pinned to them. Worker ids are global MPI ranks; rank 0 is the center, and each node's first worker is its sentinel.
 */
export interface MockTopology {
    readonly nodes: readonly MockNodePlace[];
    /** Ascending worker id. */
    readonly ranks: readonly MockRankPlace[];
}

export namespace MockTopology {

    export const CENTER_ID = 0;

    export function hostName(index: number): string {
        return `mock-host-${String(index + 1).padStart(2, '0')}`;
    }

    export function of(shape: MockShape): MockTopology {
        const nodes = Array.from({ length: shape.nodes }, (_, index) => nodePlace(shape, index));
        const ranks: MockRankPlace[] = [];
        for (const node of nodes) {
            const ids = Array.from({ length: shape.ranksPerNode }, (_, local) => node.index * shape.ranksPerNode + local);
            ranks.push(...placeOnNode(shape, node, ids.map((id, local) => ({ rank: id, socketId: local % shape.socketsPerNode }))));
        }
        return { nodes, ranks };
    }

    /** The topology with one more worker on the node, on its least crowded socket; the node's CPUs are sliced again. */
    export function withRank(topology: MockTopology, shape: MockShape, nodeIndex: number): MockTopology {
        const node = topology.nodes[nodeIndex];
        const onNode = topology.ranks.filter(rank => rank.nodeIndex === nodeIndex);
        const crowd = node.sockets.map(socket => onNode.filter(rank => rank.socketId === socket.socketId).length);
        const socketId = node.sockets[crowd.indexOf(Math.min(...crowd))].socketId;
        const id = Math.max(...topology.ranks.map(rank => rank.id)) + 1;
        const seats = [...onNode.map(rank => ({ rank: rank.id, socketId: rank.socketId })), { rank: id, socketId }];
        return replaceNode(topology, nodeIndex, placeOnNode(shape, node, seats, onNode));
    }

    /** The topology without the worker; its node's CPUs are sliced again among the workers left. */
    export function withoutRank(topology: MockTopology, shape: MockShape, id: number): MockTopology {
        const gone = topology.ranks.find(rank => rank.id === id);
        if (!gone) {
            return topology;
        }
        const onNode = topology.ranks.filter(rank => rank.nodeIndex === gone.nodeIndex && rank.id !== id);
        const seats = onNode.map(rank => ({ rank: rank.id, socketId: rank.socketId }));
        return replaceNode(topology, gone.nodeIndex, placeOnNode(shape, topology.nodes[gone.nodeIndex], seats, onNode));
    }

    /** The node's first worker, which sends its node frames; `undefined` once the node has none. */
    export function sentinelOf(topology: MockTopology, nodeIndex: number): number | undefined {
        return topology.ranks.find(rank => rank.nodeIndex === nodeIndex)?.id;
    }

    /** The topology as gempba sends it, with each worker's current process id. */
    export function toWire(topology: MockTopology, pidOf: (id: number) => number): Schema1Topology {
        return {
            nodes: topology.nodes.map(node => ({
                hostname: node.host,
                sentinel_worker_id: sentinelOf(topology, node.index) ?? 0,
                total_physical_cores: node.physicalCores,
                total_logical_cores: node.logicalCores,
                mem_total_bytes: node.memTotalBytes,
                worker_ids: topology.ranks.filter(rank => rank.nodeIndex === node.index).map(rank => rank.id),
                sockets: node.sockets.map(socket => ({
                    socket_id: socket.socketId, name: socket.name, physical_cores: socket.physicalCores, logical_cores: socket.logicalCores,
                    cpu_ids: socket.cpuIds
                }))
            })),
            identities: topology.ranks.map(rank => ({
                worker_id: rank.id,
                hostname: topology.nodes[rank.nodeIndex].host,
                pid: pidOf(rank.id),
                primary_socket: rank.socketId,
                allowed_cpu_ids: rank.allowedCpuIds
            }))
        };
    }

    /** Linux numbering: each socket's first hardware threads, then, with SMT, their siblings after every socket's. */
    function nodePlace(shape: MockShape, index: number): MockNodePlace {
        const physical = shape.socketsPerNode * shape.coresPerSocket;
        const sockets = Array.from({ length: shape.socketsPerNode }, (_, socketId) => {
            const first = Array.from({ length: shape.coresPerSocket }, (__, core) => socketId * shape.coresPerSocket + core);
            const cpuIds = shape.smt ? [...first, ...first.map(cpu => cpu + physical)] : first;
            return {
                socketId, name: `Mock ${shape.coresPerSocket}-core CPU`, physicalCores: shape.coresPerSocket,
                logicalCores: MockShape.logicalPerSocket(shape), cpuIds
            };
        });
        return {
            host: hostName(index), index, physicalCores: physical, logicalCores: physical * (shape.smt ? 2 : 1),
            memTotalBytes: shape.memPerNodeGiB * GiB, sockets
        };
    }

    /**
     * Pins the seated workers: each socket's cores are split into disjoint slices, whole cores with their siblings,
     * the remainder going to the first workers; with more workers than CPUs, each gets one CPU in turn. A worker that
     * was already placed keeps its pool size.
     */
    function placeOnNode(shape: MockShape, node: MockNodePlace, seats: readonly { rank: number, socketId: number }[],
        existing: readonly MockRankPlace[] = []): MockRankPlace[] {
        const placed: MockRankPlace[] = [];
        for (const socket of node.sockets) {
            const seated = seats.filter(seat => seat.socketId === socket.socketId);
            const byCore = coresOf(socket, shape);
            const share = Math.floor(byCore.length / Math.max(seated.length, 1));
            const extra = byCore.length % Math.max(seated.length, 1);
            let next = 0;
            seated.forEach((seat, i) => {
                let allowed: number[];
                if (share === 0) {
                    allowed = byCore[i % byCore.length];
                } else {
                    const count = share + (i < extra ? 1 : 0);
                    allowed = byCore.slice(next, next + count).flat();
                    next += count;
                }
                allowed = [...allowed].sort((a, b) => a - b);
                const before = existing.find(rank => rank.id === seat.rank);
                const poolThreads = before?.poolThreads ?? (shape.poolThreads > 0 ? shape.poolThreads : allowed.length);
                placed.push({ id: seat.rank, nodeIndex: node.index, socketId: socket.socketId, allowedCpuIds: allowed, poolThreads });
            });
        }
        return placed.sort((a, b) => a.id - b.id);
    }

    /** The socket's CPUs grouped by physical core: `[0, 16]`, `[1, 17]`… with SMT, `[0]`, `[1]`… without. */
    function coresOf(socket: MockSocketPlace, shape: MockShape): number[][] {
        const physical = socket.cpuIds.slice(0, socket.physicalCores);
        return shape.smt ? physical.map(cpu => [cpu, cpu + shape.socketsPerNode * shape.coresPerSocket]) : physical.map(cpu => [cpu]);
    }

    function replaceNode(topology: MockTopology, nodeIndex: number, placed: readonly MockRankPlace[]): MockTopology {
        const ranks = [...topology.ranks.filter(rank => rank.nodeIndex !== nodeIndex), ...placed].sort((a, b) => a.id - b.id);
        return { nodes: topology.nodes, ranks };
    }
}
