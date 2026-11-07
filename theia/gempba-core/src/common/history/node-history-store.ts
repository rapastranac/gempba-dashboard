import { WorldSnapshot } from '../model/world-snapshot';
import { NodeSample } from './node-sample';
import { NodeSeries } from './node-series';

/**
 * Per-node rolling utilization and memory history for the grid sparklines; the telemetry stream itself keeps none.
 * A sample is appended only for nodes carrying live memory (their sentinel emitted a node frame).
 */
export class NodeHistoryStore {

    /** Samples kept per host: about two minutes at the default 1 Hz node cadence. */
    static readonly CAPACITY = 120;

    protected readonly samplesByHost = new Map<string, NodeSample[]>();

    update(snapshot: WorldSnapshot | undefined): void {
        if (!snapshot) {
            return;
        }
        for (const node of snapshot.nodes) {
            if (!node.hasLiveMemory) {
                continue;
            }
            let samples = this.samplesByHost.get(node.host);
            if (!samples) {
                samples = [];
                this.samplesByHost.set(node.host, samples);
            }
            samples.push({
                timeStamp: snapshot.timestampMillis,
                cpuPct: node.nodeUtilPct,
                memUsedBytes: node.memUsedBytes,
                memTotalBytes: node.memTotalBytes
            });
            if (samples.length > NodeHistoryStore.CAPACITY) {
                samples.splice(0, samples.length - NodeHistoryStore.CAPACITY);
            }
        }
    }

    seriesFor(host: string): NodeSeries {
        const samples = this.samplesByHost.get(host);
        if (!samples || samples.length === 0) {
            return NodeSeries.empty();
        }
        const last = samples[samples.length - 1];
        return {
            cpu: samples.map(sample => sample.cpuPct),
            mem: samples.map(sample => sample.memUsedBytes),
            cpuLatest: last.cpuPct,
            memUsedLatest: last.memUsedBytes,
            memTotalLatest: last.memTotalBytes
        };
    }

    /** Hosts with at least one retained sample, in first-seen order. */
    hosts(): readonly string[] {
        return [...this.samplesByHost.keys()];
    }

    clear(): void {
        this.samplesByHost.clear();
    }
}
