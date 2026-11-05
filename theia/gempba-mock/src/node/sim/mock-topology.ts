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

export interface MockWorkerPlace {
    readonly workerId: number;
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
    readonly workers: readonly MockWorkerPlace[];
}

export namespace MockTopology {

    export const CENTER_ID = 0;

    export function hostName(index: number): string {
        return `mock-host-${String(index + 1).padStart(2, '0')}`;
    }

    export function of(shape: MockShape): MockTopology {
        const nodes = Array.from({ length: shape.nodes }, (_, index) => nodePlace(shape, index));
        const workers: MockWorkerPlace[] = [];
        for (const node of nodes) {
            const ids = Array.from({ length: shape.workersPerNode }, (_, local) => node.index * shape.workersPerNode + local);
            workers.push(...placeOnNode(shape, node, ids.map((workerId, local) => ({ workerId, socketId: local % shape.socketsPerNode }))));
        }
        return { nodes, workers };
    }

    /** The topology with one more worker on the node, on its least crowded socket; the node's CPUs are sliced again. */
    export function withWorker(topology: MockTopology, shape: MockShape, nodeIndex: number): MockTopology {
        const node = topology.nodes[nodeIndex];
        const onNode = topology.workers.filter(worker => worker.nodeIndex === nodeIndex);
        const crowd = node.sockets.map(socket => onNode.filter(worker => worker.socketId === socket.socketId).length);
        const socketId = node.sockets[crowd.indexOf(Math.min(...crowd))].socketId;
        const workerId = Math.max(...topology.workers.map(worker => worker.workerId)) + 1;
        const seats = [...onNode.map(worker => ({ workerId: worker.workerId, socketId: worker.socketId })), { workerId, socketId }];
        return replaceNode(topology, nodeIndex, placeOnNode(shape, node, seats, onNode));
    }

    /** The topology without the worker; its node's CPUs are sliced again among the workers left. */
    export function withoutWorker(topology: MockTopology, shape: MockShape, workerId: number): MockTopology {
        const gone = topology.workers.find(worker => worker.workerId === workerId);
        if (!gone) {
            return topology;
        }
        const onNode = topology.workers.filter(worker => worker.nodeIndex === gone.nodeIndex && worker.workerId !== workerId);
        const seats = onNode.map(worker => ({ workerId: worker.workerId, socketId: worker.socketId }));
        return replaceNode(topology, gone.nodeIndex, placeOnNode(shape, topology.nodes[gone.nodeIndex], seats, onNode));
    }

    /** The node's first worker, which sends its node frames; `undefined` once the node has none. */
    export function sentinelOf(topology: MockTopology, nodeIndex: number): number | undefined {
        return topology.workers.find(worker => worker.nodeIndex === nodeIndex)?.workerId;
    }

    /** The topology as gempba sends it, with each worker's current process id. */
    export function toWire(topology: MockTopology, pidOf: (workerId: number) => number): Schema1Topology {
        return {
            nodes: topology.nodes.map(node => ({
                hostname: node.host,
                sentinel_worker_id: sentinelOf(topology, node.index) ?? 0,
                total_physical_cores: node.physicalCores,
                total_logical_cores: node.logicalCores,
                mem_total_bytes: node.memTotalBytes,
                worker_ids: topology.workers.filter(worker => worker.nodeIndex === node.index).map(worker => worker.workerId),
                sockets: node.sockets.map(socket => ({
                    socket_id: socket.socketId, name: socket.name, physical_cores: socket.physicalCores, logical_cores: socket.logicalCores,
                    cpu_ids: socket.cpuIds
                }))
            })),
            identities: topology.workers.map(worker => ({
                worker_id: worker.workerId,
                hostname: topology.nodes[worker.nodeIndex].host,
                pid: pidOf(worker.workerId),
                primary_socket: worker.socketId,
                allowed_cpu_ids: worker.allowedCpuIds
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
    function placeOnNode(shape: MockShape, node: MockNodePlace, seats: readonly { workerId: number, socketId: number }[],
        existing: readonly MockWorkerPlace[] = []): MockWorkerPlace[] {
        const placed: MockWorkerPlace[] = [];
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
                const before = existing.find(worker => worker.workerId === seat.workerId);
                const poolThreads = before?.poolThreads ?? (shape.poolThreads > 0 ? shape.poolThreads : allowed.length);
                placed.push({ workerId: seat.workerId, nodeIndex: node.index, socketId: socket.socketId, allowedCpuIds: allowed, poolThreads });
            });
        }
        return placed.sort((a, b) => a.workerId - b.workerId);
    }

    /** The socket's CPUs grouped by physical core: `[0, 16]`, `[1, 17]`… with SMT, `[0]`, `[1]`… without. */
    function coresOf(socket: MockSocketPlace, shape: MockShape): number[][] {
        const physical = socket.cpuIds.slice(0, socket.physicalCores);
        return shape.smt ? physical.map(cpu => [cpu, cpu + shape.socketsPerNode * shape.coresPerSocket]) : physical.map(cpu => [cpu]);
    }

    function replaceNode(topology: MockTopology, nodeIndex: number, placed: readonly MockWorkerPlace[]): MockTopology {
        const workers = [...topology.workers.filter(worker => worker.nodeIndex !== nodeIndex), ...placed].sort((a, b) => a.workerId - b.workerId);
        return { nodes: topology.nodes, workers };
    }
}
