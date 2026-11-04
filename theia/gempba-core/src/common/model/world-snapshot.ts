import { NodeSnapshot } from './node-snapshot';
import { RunSetup } from './run-setup';
import { StructureKey } from './structure-key';
import { WorkerSnapshot } from './worker-snapshot';

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
    /** The id telemetry drew for this run, telling runs apart; absent before telemetry schema 2. */
    readonly runId?: string;
    /** How the run is set up; absent before telemetry schema 2. */
    readonly run?: RunSetup;
    /** Whether telemetry is paused: the data is the latest gempba sent before or during the pause. */
    readonly paused?: boolean;
    /** Whether this is the run's last line, sent at shutdown with its totals. */
    readonly final?: boolean;
}

export namespace WorldSnapshot {

    /** Worker ids are ranks; telemetry schema 1's two schedulers always put their coordinator on rank 0. */
    export const SCHEMA_1_COORDINATOR_ID = 0;

    /** The first telemetry schema whose ranks declare their scheduler role. */
    export const SCHEMA_WITH_ROLES = 2;

    export function empty(): WorldSnapshot {
        return { schemaVersion: 0, timestampMillis: 0, elapsedSeconds: 0, nodes: [], structure: StructureKey.empty() };
    }

    export function totalNodes(snapshot: WorldSnapshot): number {
        return snapshot.nodes.length;
    }

    export function totalWorkers(snapshot: WorldSnapshot): number {
        return snapshot.nodes.reduce((total, node) => total + NodeSnapshot.workerCount(node), 0);
    }

    /**
     * Whether the worker is the scheduler's coordinator, which hands out work and runs no tasks, as its declared role
     * says. Telemetry schema 1 declares no roles; its two schedulers always put the coordinator on rank 0, once the run
     * has other processes. A schema-2 run without roles has none.
     */
    export function isCoordinator(snapshot: WorldSnapshot | undefined, workerId: number): boolean {
        if (!snapshot) {
            return false;
        }
        const role = workerOf(snapshot, workerId)?.role;
        if (role !== undefined) {
            return role === 'coordinator';
        }
        return snapshot.schemaVersion < SCHEMA_WITH_ROLES && workerId === SCHEMA_1_COORDINATOR_ID && totalWorkers(snapshot) > 1;
    }

    export function workerOf(snapshot: WorldSnapshot, workerId: number): WorkerSnapshot | undefined {
        for (const node of snapshot.nodes) {
            for (const socket of node.sockets) {
                const worker = socket.workers.find(each => each.workerId === workerId);
                if (worker) {
                    return worker;
                }
            }
        }
        return undefined;
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
