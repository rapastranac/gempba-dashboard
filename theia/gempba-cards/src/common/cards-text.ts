import { Bytes, Cpu, Durations, NodeSeries, NodeSnapshot, NumberText, Peers, Rates, SocketSnapshot, WorkerSnapshot, WorldSnapshot } from '@gempba/core';

/** The words of the Cards view, worded like the Java dashboard's cards. Pure, so the view only lays them out. */
export namespace CardsText {

    /** The label of the row whose value can open the full list of outgoing peers. */
    export const OUTGOING_PEERS = 'Outgoing peers';

    export interface Row {
        readonly label: string;
        readonly value: string;
    }

    export interface Section {
        readonly title: string;
        readonly rows: readonly Row[];
    }

    /** What the details panel shows for the picked node, socket or worker. */
    export interface Details {
        readonly title: string;
        readonly subtitle: string;
        readonly sections: readonly Section[];
    }

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

    /**
     * A node's hardware and activity; hardware the topology did not describe is left out rather than shown as 0.
     * Memory comes from the node's history, like the Grid tile's: node frames arrive at the node rate, so most
     * snapshots carry none, and the last one received still holds.
     */
    export function nodeDetails(node: NodeSnapshot, history: NodeSeries): Details {
        const hardware: Row[] = [];
        if (node.socketCount > 0) {
            hardware.push({ label: 'Sockets', value: String(node.socketCount) });
        }
        if (node.logicalCores > 0) {
            hardware.push({ label: 'Cores', value: cores(node.physicalCores, node.logicalCores) });
        }
        const memory = nodeMemory(node, history);
        if (memory) {
            hardware.push({ label: 'Memory', value: memory });
        }
        const activity: Row[] = [
            { label: 'CPU', value: `${NumberText.fixed(node.nodeUtilPct, 1)} % of its allocated cores` },
            { label: 'Workers', value: String(NodeSnapshot.workerCount(node)) },
            { label: 'Sentinel', value: `Worker ${node.sentinelWorkerId}` }
        ];
        const sections: Section[] = hardware.length > 0 ? [{ title: 'Hardware', rows: hardware }] : [];
        sections.push({ title: 'Activity', rows: activity });
        return { title: node.host, subtitle: nodeCaption(node), sections };
    }

    /** `Socket 0`, or `Socket 0: Xeon Gold 6148` when the topology names it. */
    export function socketTitle(socket: SocketSnapshot): string {
        return socket.hasTopology && socket.name ? `Socket ${socket.socketId}: ${socket.name}` : `Socket ${socket.socketId}`;
    }

    /** The short caption of a socket's tree row, e.g. `2 workers`. */
    export function socketCaption(socket: SocketSnapshot): string {
        return plural(socket.workers.length, 'worker');
    }

    export function socketDetails(host: string, socket: SocketSnapshot): Details {
        const topology: Row[] = [];
        if (socket.hasTopology) {
            topology.push({ label: 'Cores', value: cores(socket.physicalCores, socket.logicalCores) });
            const range = Cpu.range(socket.cpuIds);
            if (range) {
                topology.push({ label: 'CPU ids', value: range.replace(/^CPUs /, '') });
            }
        }
        topology.push({ label: 'Workers', value: String(socket.workers.length) });
        const sections: Section[] = [{ title: 'Topology', rows: topology }];
        if (socket.coreUsage.length > 0) {
            sections.push({
                title: 'Core usage',
                rows: socket.coreUsage.map(usage => ({ label: `Worker ${usage.workerId}`, value: Cpu.coreUsage(usage.cpuPct, usage.accessibleCores, usage.socketCores) }))
            });
        }
        return { title: socketTitle(socket), subtitle: `on ${host}`, sections };
    }

    /** `Worker 3`, or `Worker 0 · sentinel`; the view marks the sentinel with a star icon. */
    export function workerTitle(worker: WorkerSnapshot): string {
        return worker.sentinel ? `Worker ${worker.workerId} · sentinel` : `Worker ${worker.workerId}`;
    }

    /** The short caption of a worker's tree row, e.g. `87.3 % CPU · 256.0 MB`. */
    export function workerCaption(worker: WorkerSnapshot): string {
        return `${NumberText.fixed(worker.cpuPct, 1)} % CPU · ${Bytes.human(worker.rssBytes)}`;
    }

    /** e.g. `PID 4100 · frame #17 · on alpha`. */
    export function workerSubtitle(host: string, worker: WorkerSnapshot): string {
        const parts = worker.pid > 0 ? [`PID ${worker.pid}`] : [];
        parts.push(`frame #${worker.seqNo}`, `on ${host}`);
        return parts.join(' · ');
    }

    /** A worker's counters in the Java card's sections and order. */
    export function workerDetails(host: string, worker: WorkerSnapshot): Details {
        const elapsed = worker.elapsedSeconds;
        return {
            title: workerTitle(worker),
            subtitle: workerSubtitle(host, worker),
            sections: [{
                title: 'Local work', rows: [
                    { label: 'Tasks completed', value: Rates.countWithRate(worker.tasksLocalTotal, elapsed) },
                    { label: 'Tasks running', value: `${plural(worker.tasksRunning, 'task')} in pool` }
                ]
            }, {
                title: 'Remote work', rows: [
                    { label: 'Received from peers', value: Rates.countWithRate(worker.tasksRecvTotal, elapsed) },
                    { label: 'Sent to peers', value: Rates.countWithRate(worker.tasksSentTotal, elapsed) },
                    { label: OUTGOING_PEERS, value: Peers.summarize(worker.peers) },
                    { label: 'IPC queue', value: `${plural(worker.schedulerPendingCount, 'task')} pending` }
                ]
            }, {
                title: 'Process', rows: [
                    { label: 'CPU', value: `${NumberText.fixed(worker.cpuPct, 1)} %` },
                    { label: 'Memory', value: Bytes.human(worker.rssBytes) },
                    { label: 'Threads', value: String(worker.threads) },
                    { label: 'Pool idle', value: `${Durations.format(worker.idleMicrosPerWorker)} (cumulative average per pool worker)` }
                ]
            }]
        };
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

    /** The last memory a node frame reported, or else the topology's total, or nothing when neither is known. */
    function nodeMemory(node: NodeSnapshot, history: NodeSeries): string | undefined {
        if (history.memTotalLatest > 0) {
            return `${Bytes.human(history.memUsedLatest)} used of ${Bytes.human(history.memTotalLatest)}`;
        }
        if (node.hasLiveMemory) {
            return `${Bytes.human(node.memUsedBytes)} used of ${Bytes.human(node.memTotalBytes)}`;
        }
        return node.memTotalBytes > 0 ? `${Bytes.human(node.memTotalBytes)} total memory` : undefined;
    }

    function cores(physical: number, logical: number): string {
        return physical > 0 ? `${physical} physical / ${plural(logical, 'logical core')}` : plural(logical, 'logical core');
    }

    function plural(count: number, noun: string): string {
        return `${count} ${noun}${count === 1 ? '' : 's'}`;
    }
}
