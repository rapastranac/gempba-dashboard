import { NodeSnapshot } from './node-snapshot';
import { RunSetup } from './run-setup';
import { StructureKey } from './structure-key';
import { RankSnapshot } from './rank-snapshot';

/**
 * The immutable read-model for one telemetry frame: the single value the UI renders from.
 * Raw magnitudes only; wire types never reach it.
 */
export interface WorldSnapshot {
    readonly timestampMillis: number;
    readonly elapsedSeconds: number;
    /** First-seen host order. */
    readonly nodes: readonly NodeSnapshot[];
    readonly structure: StructureKey;
    /** The id telemetry drew for this run, telling runs apart; empty before any line. */
    readonly runId: string;
    /** How the run is set up; absent until a full line arrives. */
    readonly run?: RunSetup;
    /** Whether telemetry is paused: the data is the latest gempba sent before or during the pause. */
    readonly paused: boolean;
    /** Whether this is the run's last line, sent at shutdown with its totals. */
    readonly final: boolean;
    /**
     * Whether the line carried its header alone, as gempba's do while paused: the data is the last line's again, and
     * no new frame. A snapshot or the final line sent while paused carries frames, and leaves this unset.
     */
    readonly headerOnly?: boolean;
}

export namespace WorldSnapshot {

    /** Telemetry's aggregator, which collects every rank's frames and serves the stream, in every run and whatever the scheduler. */
    export const AGGREGATOR_RANK = 0;

    export function empty(): WorldSnapshot {
        return { timestampMillis: 0, elapsedSeconds: 0, nodes: [], structure: StructureKey.empty(), runId: '', paused: false, final: false };
    }

    export function totalNodes(snapshot: WorldSnapshot): number {
        return snapshot.nodes.length;
    }

    export function totalRanks(snapshot: WorldSnapshot): number {
        return snapshot.nodes.reduce((total, node) => total + NodeSnapshot.rankCount(node), 0);
    }

    /** Whether the rank is the scheduler's coordinator, which hands out work and runs no tasks, as its declared role says. */
    export function isCoordinator(snapshot: WorldSnapshot | undefined, id: number): boolean {
        return snapshot !== undefined && rankOf(snapshot, id)?.role === 'coordinator';
    }

    export function rankOf(snapshot: WorldSnapshot, id: number): RankSnapshot | undefined {
        for (const node of snapshot.nodes) {
            for (const socket of node.sockets) {
                const rank = socket.ranks.find(each => each.id === id);
                if (rank) {
                    return rank;
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
            socket.ranks.map(rank => StructureKey.keyOf(node.host, socket.socketId, rank.id))));
        return { ...snapshot, nodes, structure: StructureKey.of(keys) };
    }
}
