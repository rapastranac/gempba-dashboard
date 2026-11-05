import { WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, Topology } from '../protocol/wire-protocol';
import { WorldSnapshotMapper } from './world-snapshot-mapper';

/**
 * Stateful front door to the mapper. It remembers the last usable topology and substitutes it into a
 * frame that arrives without one; mapping such a frame alone would orphan every rank to
 * "(unknown host)" and collapse the per-allocation utilization to zero. It also remembers the last
 * snapshot, which a paused line, carrying only the envelope's header, keeps as it was.
 */
export class TelemetryStore {

    protected lastTopology: Topology | undefined;
    protected lastSnapshot: WorldSnapshot | undefined;

    ingest(envelope: BroadcastEnvelope | undefined): WorldSnapshot {
        if (!envelope) {
            return WorldSnapshot.empty();
        }
        if (this.lastSnapshot && isHeaderOnly(envelope)) {
            return { ...this.lastSnapshot, paused: envelope.paused === true, final: envelope.final === true };
        }
        this.lastSnapshot = WorldSnapshotMapper.toWorldSnapshot(this.withTopology(envelope));
        return this.lastSnapshot;
    }

    /** Forgets the cached topology and snapshot, on reconnect or a new target. */
    reset(): void {
        this.lastTopology = undefined;
        this.lastSnapshot = undefined;
    }

    protected withTopology(envelope: BroadcastEnvelope): BroadcastEnvelope {
        if (isUsable(envelope.topology)) {
            this.lastTopology = envelope.topology;
            return envelope;
        }
        return this.lastTopology ? { ...envelope, topology: this.lastTopology } : envelope;
    }
}

/** A paused line: the header alone, no topology or frames. A snapshot or the final line sent while paused carries them. */
function isHeaderOnly(envelope: BroadcastEnvelope): boolean {
    return envelope.topology === undefined && envelope.ranks === undefined && envelope.nodes === undefined;
}

function isUsable(topology: Topology | undefined): topology is Topology {
    return (topology?.identities?.length ?? 0) > 0;
}
