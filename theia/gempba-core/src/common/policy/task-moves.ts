import { WorldSnapshot } from '../model/world-snapshot';

/** What some workers did with tasks over the run: started them on their own threads, or moved them between processes. */
export interface TaskMoves {
    readonly started: number;
    readonly sent: number;
    readonly received: number;
    /**
     * Of those sent, the ones that went to a process on another node, so across a network; told from the peers each worker
     * sent to. The rest stayed on their node, where processes share memory.
     */
    readonly acrossNodes: number;
}

export namespace TaskMoves {

    /** Every worker of the run, or only a node's when a host is given. */
    export function of(world: WorldSnapshot, host?: string): TaskMoves {
        const hostOf = new Map<number, string>();
        for (const node of world.nodes) {
            for (const rank of node.sockets.flatMap(socket => socket.ranks)) {
                hostOf.set(rank.id, node.host);
            }
        }
        let started = 0;
        let sent = 0;
        let received = 0;
        let acrossNodes = 0;
        for (const node of world.nodes.filter(candidate => host === undefined || candidate.host === host)) {
            for (const rank of node.sockets.flatMap(socket => socket.ranks)) {
                started += rank.tasksStartedTotal;
                sent += rank.tasksSentTotal;
                received += rank.tasksRecvTotal;
                for (const peer of rank.peers) {
                    const to = hostOf.get(peer.peerRank);
                    if (to !== undefined && to !== node.host) {
                        acrossNodes += peer.count;
                    }
                }
            }
        }
        return { started, sent, received, acrossNodes };
    }
}
