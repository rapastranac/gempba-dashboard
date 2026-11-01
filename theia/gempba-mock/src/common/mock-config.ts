import { ConnectionMode } from '@gempba/core';

/** What the built-in mocker runs: how the dashboard reaches it, the cluster it imitates, and what that cluster does. */
export interface MockConfig {
    readonly access: MockAccess;
    readonly shape: MockShape;
    /** Fixed for the run, as gempba's is. */
    readonly scheduler: MockScheduler;
    readonly live: MockLive;
    /** The same seed and shape give the same run. */
    readonly seed: number;
}

/** How the dashboard reaches the mock center: directly in Local mode, through the mock SSH server in Host and Jump. */
export interface MockAccess {
    readonly mode: ConnectionMode;
    /** The loopback port the mock center listens on, as gempba's does. */
    readonly gempbaPort: number;
    /** The loopback port of the mock SSH server. */
    readonly sshPort: number;
    readonly keySource: MockKeySource;
    readonly mfa: boolean;
    readonly mfaCode: string;
}

/** Which public keys the mock SSH server accepts: the user's own, or a key pair the mocker generates. */
export type MockKeySource = 'system' | 'generated';

/** The cluster the mocker imitates; it is fixed while the mocker runs. */
export interface MockShape {
    readonly nodes: number;
    readonly socketsPerNode: number;
    /** Physical cores per socket. */
    readonly coresPerSocket: number;
    /** Two hardware threads per core, so twice as many logical CPUs. */
    readonly smt: boolean;
    readonly workersPerNode: number;
    /** Each worker's pool threads; 0 gives one per CPU the worker may use. */
    readonly poolThreads: number;
    readonly memPerNodeGiB: number;
    /** The job's memory-cgroup limit on each node; 0 runs outside a memory cgroup. */
    readonly cgroupGiB: number;
}

/** What the mocked run does; it can change while the mocker runs. */
export interface MockLive {
    readonly scenario: MockScenario;
    /** How busy the workers try to keep their pools, from 0 to 100 %. */
    readonly loadPct: number;
    readonly fidelity: MockFidelity;
}

export type MockScenario = 'steady' | 'slow' | 'ramp' | 'imbalanced' | 'bursty';

/**
 * gempba's two schedulers. Semi-centralized: the center pairs each busy worker with an idle one, and the worker sends it
 * one task directly. Centralized: workers send spare tasks to a queue at the center, which hands them to idle workers.
 */
export type MockScheduler = 'semi-centralized' | 'centralized';

/** `gempba` sends what gempba sends today, zeros and its fixed broadcast included; `full` fills every field. */
export type MockFidelity = 'gempba' | 'full';

export namespace MockConfig {

    export const SCENARIOS: readonly MockScenario[] = ['steady', 'slow', 'ramp', 'imbalanced', 'bursty'];
    export const SCHEDULERS: readonly MockScheduler[] = ['semi-centralized', 'centralized'];
    export const FIDELITIES: readonly MockFidelity[] = ['gempba', 'full'];
    export const KEY_SOURCES: readonly MockKeySource[] = ['system', 'generated'];

    export const MAX_WORKERS = 4096;

    /** Each counted shape field's whole-number bounds. */
    export const SHAPE_BOUNDS: { readonly [K in MockShape.Count]: readonly [number, number] } = {
        nodes: [1, 64],
        socketsPerNode: [1, 8],
        coresPerSocket: [1, 128],
        workersPerNode: [1, 256],
        poolThreads: [0, 256],
        memPerNodeGiB: [1, 4096],
        cgroupGiB: [0, 4096]
    };

    export function defaults(): MockConfig {
        return {
            access: { mode: ConnectionMode.LOCAL, gempbaPort: 9000, sshPort: 2222, keySource: 'system', mfa: false, mfaCode: '123456' },
            shape: {
                nodes: 2, socketsPerNode: 2, coresPerSocket: 8, smt: false, workersPerNode: 4, poolThreads: 0, memPerNodeGiB: 64, cgroupGiB: 0
            },
            scheduler: 'semi-centralized',
            live: { scenario: 'steady', loadPct: 85, fidelity: 'gempba' },
            seed: 42
        };
    }

    /** A configuration from stored or typed values: each field that is missing or of the wrong kind takes its default. */
    export function of(value: unknown): MockConfig {
        const fallback = defaults();
        const json = objectOf(value);
        const access = objectOf(json.access);
        const shape = objectOf(json.shape);
        const live = objectOf(json.live);
        return {
            access: {
                mode: oneOf(access.mode, Object.values(ConnectionMode), fallback.access.mode),
                gempbaPort: numberOr(access.gempbaPort, fallback.access.gempbaPort),
                sshPort: numberOr(access.sshPort, fallback.access.sshPort),
                keySource: oneOf(access.keySource, KEY_SOURCES, fallback.access.keySource),
                mfa: typeof access.mfa === 'boolean' ? access.mfa : fallback.access.mfa,
                mfaCode: typeof access.mfaCode === 'string' ? access.mfaCode : fallback.access.mfaCode
            },
            shape: {
                nodes: numberOr(shape.nodes, fallback.shape.nodes),
                socketsPerNode: numberOr(shape.socketsPerNode, fallback.shape.socketsPerNode),
                coresPerSocket: numberOr(shape.coresPerSocket, fallback.shape.coresPerSocket),
                smt: typeof shape.smt === 'boolean' ? shape.smt : fallback.shape.smt,
                workersPerNode: numberOr(shape.workersPerNode, fallback.shape.workersPerNode),
                poolThreads: numberOr(shape.poolThreads, fallback.shape.poolThreads),
                memPerNodeGiB: numberOr(shape.memPerNodeGiB, fallback.shape.memPerNodeGiB),
                cgroupGiB: numberOr(shape.cgroupGiB, fallback.shape.cgroupGiB)
            },
            scheduler: oneOf(json.scheduler, SCHEDULERS, fallback.scheduler),
            live: {
                scenario: oneOf(live.scenario, SCENARIOS, fallback.live.scenario),
                loadPct: numberOr(live.loadPct, fallback.live.loadPct),
                fidelity: oneOf(live.fidelity, FIDELITIES, fallback.live.fidelity)
            },
            seed: numberOr(json.seed, fallback.seed)
        };
    }

    /** What stops the configuration from running, in words; empty when it can run. */
    /**
     * The cluster a run imitates: Local is this machine and Host is one VM, so each is one node; only Jump reaches
     * a cluster's compute nodes behind a login node. The node count typed for Jump is kept while another mode runs.
     */
    export function shapeOf(config: MockConfig): MockShape {
        return config.access.mode === ConnectionMode.JUMP ? config.shape : { ...config.shape, nodes: 1 };
    }

    export function problems(config: MockConfig): string[] {
        const found: string[] = [];
        const { access, live } = config;
        const shape = shapeOf(config);
        port('The gempba port', access.gempbaPort, found);
        if (access.mode !== ConnectionMode.LOCAL) {
            port('The SSH port', access.sshPort, found);
            if (access.sshPort === access.gempbaPort) {
                found.push('The SSH port must differ from the gempba port.');
            }
            if (access.mfa && access.mfaCode.trim() === '') {
                found.push('MFA needs a passcode.');
            }
        }
        for (const key of Object.keys(SHAPE_BOUNDS) as MockShape.Count[]) {
            const [min, max] = SHAPE_BOUNDS[key];
            if (!whole(shape[key], min, max)) {
                found.push(`${SHAPE_LABELS[key]} must be a whole number from ${min} to ${max}.`);
            }
        }
        const workers = MockShape.totalWorkers(shape);
        if (workers < 2 || workers > MAX_WORKERS) {
            found.push(`The cluster needs from 2 to ${MAX_WORKERS} workers in all: the center and at least one worker; it has ${workers}.`);
        }
        if (shape.cgroupGiB > shape.memPerNodeGiB) {
            found.push('The cgroup limit cannot exceed the memory per node.');
        }
        if (!(live.loadPct >= 0 && live.loadPct <= 100)) {
            found.push('The load must be from 0 to 100 %.');
        }
        if (!Number.isInteger(config.seed)) {
            found.push('The seed must be a whole number.');
        }
        return found;
    }

    export const SHAPE_LABELS: { readonly [K in MockShape.Count]: string } = {
        nodes: 'Nodes',
        socketsPerNode: 'Sockets per node',
        coresPerSocket: 'Cores per socket',
        workersPerNode: 'Workers per node',
        poolThreads: 'Pool threads',
        memPerNodeGiB: 'Memory per node',
        cgroupGiB: 'The cgroup limit'
    };

    function port(label: string, value: number, found: string[]): void {
        if (!whole(value, 1, 65535)) {
            found.push(`${label} must be a whole number from 1 to 65535.`);
        }
    }
}

export namespace MockShape {

    /** The shape fields that count something, each a whole number within its bounds. */
    export type Count = Exclude<keyof MockShape, 'smt'>;

    export function totalWorkers(shape: MockShape): number {
        return shape.nodes * shape.workersPerNode;
    }

    /** Logical CPUs per socket. */
    export function logicalPerSocket(shape: MockShape): number {
        return shape.coresPerSocket * (shape.smt ? 2 : 1);
    }
}

type JsonObject = Record<string, unknown>;

function objectOf(value: unknown): JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function numberOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function oneOf<T>(value: unknown, choices: readonly T[], fallback: T): T {
    return choices.find(choice => choice === value) ?? fallback;
}

function whole(value: number, min: number, max: number): boolean {
    return Number.isInteger(value) && value >= min && value <= max;
}
