import { Bytes, NodeSnapshot, NumberText, SocketSnapshot, RankSnapshot, WorldSnapshot } from '@gempba/core';

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
        return `${plural(node.sockets.length, 'socket')} · ${plural(NodeSnapshot.rankCount(node), 'worker')}`;
    }

    /** `Socket 0`, or `Socket 0: Xeon Gold 6148` when the topology names it. */
    export function socketTitle(socket: SocketSnapshot): string {
        return socket.hasTopology && socket.name ? `Socket ${socket.socketId}: ${socket.name}` : `Socket ${socket.socketId}`;
    }

    /** The short caption of a socket's tree row, e.g. `2 workers`. */
    export function socketCaption(socket: SocketSnapshot): string {
        return plural(socket.ranks.length, 'worker');
    }

    /** `Worker 3`, `Worker 3 · sentinel`, or `Worker 0 · coordinator · sentinel`; the view marks the sentinel with a star icon. */
    export function rankTitle(rank: RankSnapshot, coordinator = false): string {
        return [`Worker ${rank.id}`, ...(coordinator ? ['coordinator'] : []), ...(rank.sentinel ? ['sentinel'] : [])].join(' · ');
    }

    /** The short caption of a worker's tree row, its CPU as a share of the cores it may use, as its meter shows: `22% CPU · 256.0 MB`. */
    export function rankCaption(rank: RankSnapshot, accessibleCores: number): string {
        return `${NumberText.fixed(rank.cpuPct / Math.max(accessibleCores, 1), 0)}% CPU · ${Bytes.human(rank.rssBytes)}`;
    }

    /** e.g. `PID 4100 · frame #17 · on alpha`. */
    export function rankSubtitle(host: string, rank: RankSnapshot): string {
        const parts = rank.pid > 0 ? [`PID ${rank.pid}`] : [];
        parts.push(`frame #${rank.seqNo}`, `on ${host}`);
        return parts.join(' · ');
    }

    /** Every outgoing peer of a worker, busiest first, with the node each one runs on. */
    export function peerRows(rank: RankSnapshot, world: WorldSnapshot | undefined): PeerRow[] {
        const hostOf = new Map<number, string>();
        world?.nodes.forEach(node => node.sockets.forEach(socket => socket.ranks.forEach(each => hostOf.set(each.id, node.host))));
        return [...rank.peers]
            .sort((a, b) => b.count - a.count || b.bytes - a.bytes || a.peerRank - b.peerRank)
            .map(peer => ({
                peer: `Worker ${peer.peerRank}`,
                host: hostOf.get(peer.peerRank) ?? '—',
                tasks: NumberText.grouped(peer.count),
                bytes: Bytes.human(peer.bytes)
            }));
    }

    function plural(count: number, noun: string): string {
        return `${count} ${noun}${count === 1 ? '' : 's'}`;
    }
}
