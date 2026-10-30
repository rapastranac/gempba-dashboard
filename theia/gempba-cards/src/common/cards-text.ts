import { Bytes, NodeSnapshot, NumberText, SocketSnapshot, WorkerSnapshot, WorldSnapshot } from '@gempba/core';

/** The words of the Cards tree and its peers dialog, worded like the Java dashboard's cards. Pure, so the view only lays them out. */
export namespace CardsText {

    export interface PeerRow {
        readonly peer: string;
        readonly host: string;
        readonly tasks: string;
        readonly bytes: string;
    }

    /** The short caption of a node's tree row, counting the sockets the tree lists, e.g. `2 sockets · 4 workers`. */
    export function nodeCaption(node: NodeSnapshot): string {
        return `${plural(node.sockets.length, 'socket')} · ${plural(NodeSnapshot.workerCount(node), 'worker')}`;
    }

    /** `Socket 0`, or `Socket 0: Xeon Gold 6148` when the topology names it. */
    export function socketTitle(socket: SocketSnapshot): string {
        return socket.hasTopology && socket.name ? `Socket ${socket.socketId}: ${socket.name}` : `Socket ${socket.socketId}`;
    }

    /** The short caption of a socket's tree row, e.g. `2 workers`. */
    export function socketCaption(socket: SocketSnapshot): string {
        return plural(socket.workers.length, 'worker');
    }

    /** `Worker 3`, or `Worker 0 · sentinel`; the view marks the sentinel with a star icon. */
    export function workerTitle(worker: WorkerSnapshot): string {
        return worker.sentinel ? `Worker ${worker.workerId} · sentinel` : `Worker ${worker.workerId}`;
    }

    /** The short caption of a worker's tree row, its CPU as a share of the cores it may use, as its meter shows: `22% CPU · 256.0 MB`. */
    export function workerCaption(worker: WorkerSnapshot, accessibleCores: number): string {
        return `${NumberText.fixed(worker.cpuPct / Math.max(accessibleCores, 1), 0)}% CPU · ${Bytes.human(worker.rssBytes)}`;
    }

    /** e.g. `PID 4100 · frame #17 · on alpha`. */
    export function workerSubtitle(host: string, worker: WorkerSnapshot): string {
        const parts = worker.pid > 0 ? [`PID ${worker.pid}`] : [];
        parts.push(`frame #${worker.seqNo}`, `on ${host}`);
        return parts.join(' · ');
    }

    /** Every outgoing peer of a worker, busiest first, with the node each one runs on. */
    export function peerRows(worker: WorkerSnapshot, world: WorldSnapshot | undefined): PeerRow[] {
        const hostOf = new Map<number, string>();
        world?.nodes.forEach(node => node.sockets.forEach(socket => socket.workers.forEach(each => hostOf.set(each.workerId, node.host))));
        return [...worker.peers]
            .sort((a, b) => b.count - a.count || b.bytes - a.bytes || a.peerWorkerId - b.peerWorkerId)
            .map(peer => ({
                peer: `Worker ${peer.peerWorkerId}`,
                host: hostOf.get(peer.peerWorkerId) ?? '—',
                tasks: NumberText.grouped(peer.count),
                bytes: Bytes.human(peer.bytes)
            }));
    }

    function plural(count: number, noun: string): string {
        return `${count} ${noun}${count === 1 ? '' : 's'}`;
    }
}
