import { WorldSnapshot } from '@gempba/core';
import { BroadcastEnvelope, Topology } from '../protocol/wire-protocol';
import { WorldSnapshotMapper } from './world-snapshot-mapper';

/**
 * Stateful front door to the mapper. It remembers the last usable topology and substitutes it into a
 * frame that arrives without one; mapping such a frame alone would orphan every worker to
 * "(unknown host)" and collapse the per-allocation utilization to zero.
 */
export class TelemetryStore {

    protected lastTopology: Topology | undefined;

    ingest(envelope: BroadcastEnvelope | undefined): WorldSnapshot {
        if (!envelope) {
            return WorldSnapshot.empty();
        }
        return WorldSnapshotMapper.toWorldSnapshot(this.withTopology(envelope));
    }

    /** Forgets the cached topology, on reconnect or a new target. */
    reset(): void {
        this.lastTopology = undefined;
    }

    protected withTopology(envelope: BroadcastEnvelope): BroadcastEnvelope {
        if (isUsable(envelope.topology)) {
            this.lastTopology = envelope.topology;
            return envelope;
        }
        return this.lastTopology ? { ...envelope, topology: this.lastTopology } : envelope;
    }
}

function isUsable(topology: Topology | undefined): topology is Topology {
    return (topology?.identities?.length ?? 0) > 0;
}
