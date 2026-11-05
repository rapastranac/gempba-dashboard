import { NodeFrame, RankFrame, RankIdentity, RunMarkerFrame, TopologyNode } from '@gempba/telemetry/lib/node/protocol/wire-protocol';

/**
 * What the mocker writes into a schema-2 line, under gempba v4.3.0's keys, which are the parser's own. Every key is
 * required, so a frame carries every counter, 0 where the rank's role doesn't fill it, as gempba's do.
 */
export type Schema2Frame = Required<Omit<RankFrame, 'edges_out'>>;

/** A node frame without schema 1's network and disk aggregates, which gempba v4.3.0 dropped. */
export type Schema2NodeFrame = Required<Omit<NodeFrame, 'net_aggregate' | 'disk_aggregate'>>;

export interface Schema2Topology {
    readonly nodes: readonly Required<TopologyNode>[];
    readonly identities: readonly Required<RankIdentity>[];
    readonly run: Schema2Run;
}

/** The run's setup as gempba v4.3.0 writes it: annotations an object of strings, in the order their keys were set. */
export interface Schema2Run {
    readonly scheduler: string;
    readonly load_balancer: string;
    readonly runtime_mode: string;
    readonly world_size: number;
    readonly threads_per_process: number;
    readonly gempba_version: string;
    readonly annotations: Readonly<Record<string, string>>;
    readonly markers: readonly RunMarkerFrame[];
}
