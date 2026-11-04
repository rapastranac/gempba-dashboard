import { NodeSnapshot } from './node-snapshot';
import { StructureKey } from './structure-key';

/**
 * The immutable read-model for one telemetry frame: the single value the UI renders from.
 * Raw magnitudes only; wire types never reach it.
 */
export interface WorldSnapshot {
    readonly schemaVersion: number;
    readonly timestampMillis: number;
    readonly elapsedSeconds: number;
    /** First-seen host order. */
    readonly nodes: readonly NodeSnapshot[];
    readonly structure: StructureKey;
}

export namespace WorldSnapshot {

    /** gempba's center is rank 0, and worker ids are ranks. */
    export const CENTER_ID = 0;

    export function empty(): WorldSnapshot {
        return { schemaVersion: 0, timestampMillis: 0, elapsedSeconds: 0, nodes: [], structure: StructureKey.empty() };
    }

    export function totalNodes(snapshot: WorldSnapshot): number {
        return snapshot.nodes.length;
    }

    export function totalWorkers(snapshot: WorldSnapshot): number {
        return snapshot.nodes.reduce((total, node) => total + NodeSnapshot.workerCount(node), 0);
    }

    /** Whether the worker is gempba's center, which schedules the run and runs no tasks: rank 0 once the run has other processes. */
    export function isCenter(snapshot: WorldSnapshot | undefined, workerId: number): boolean {
        return workerId === CENTER_ID && snapshot !== undefined && totalWorkers(snapshot) > 1;
    }

    /**
     * Narrows the snapshot to one host's subtree, rebuilding its structure key. An undefined host
     * returns the snapshot unchanged; an unknown host yields no nodes but keeps the frame scalars.
     */
    export function forHost(snapshot: WorldSnapshot, host: string | undefined): WorldSnapshot {
        if (host === undefined) {
            return snapshot;
        }
        const nodes = snapshot.nodes.filter(node => node.host === host);
        const keys = nodes.flatMap(node => node.sockets.flatMap(socket =>
            socket.workers.map(worker => StructureKey.keyOf(node.host, socket.socketId, worker.workerId))));
        return { ...snapshot, nodes, structure: StructureKey.of(keys) };
    }
}
