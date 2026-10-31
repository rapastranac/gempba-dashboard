import { ConnectionMode } from '@gempba/core';
import { MockConfig, MockLive, MockShape } from './mock-config';
import { MockFault } from './mock-fault';

/** The application-wide mocker: one mock for every window, run by the backend. */
export const MOCK_SERVICE_PATH = '/services/gempba-mock';

export const MockServer = Symbol('MockServer');

export interface MockServer {
    status(): Promise<MockStatus>;
    /** The configuration last started, or the defaults. */
    lastConfig(): Promise<MockConfig>;
    /** Starts the mock, stopping any one running first; rejects with what stops the configuration from running. */
    start(config: MockConfig): Promise<MockStatus>;
    stop(): Promise<void>;
    /** Changes what the running mock does: its scenario, scheduler, load and fidelity. */
    setLive(live: MockLive): Promise<void>;
    /** Injects a fault into the running mock, and says what happened. */
    fault(fault: MockFault): Promise<string>;
    /** The recent log, oldest first, for a view that opens while the mock runs. */
    recentLog(): Promise<readonly MockLogLine[]>;
    clearLog(): Promise<void>;
}

/** What the backend tells every window; the `on` prefix makes these one-way notifications. */
export interface MockClient {
    onStatus(status: MockStatus): void;
    onLog(line: MockLogLine): void;
}

export interface MockLogLine {
    /** Epoch milliseconds. */
    readonly time: number;
    readonly message: string;
}

export interface MockStatus {
    readonly running: boolean;
    /** The last run ended on its own or by the End the run fault, rather than by Stop. */
    readonly ended: boolean;
    /** The running or ended run's configuration. */
    readonly config?: MockConfig;
    readonly clients: number;
    readonly workerIntervalMs?: number;
    readonly nodeIntervalMs?: number;
    readonly workers?: number;
    /** What the Connection view needs to reach the running mock. */
    readonly reach?: MockReach;
    /** Things that will stop the dashboard from connecting, such as no accepted SSH key. */
    readonly warnings: readonly string[];
}

/** How a window reaches the mock: what to type into the Connection view. */
export interface MockReach {
    readonly mode: ConnectionMode;
    /** `user@host` of the mock VM or login node; absent in Local mode. */
    readonly sshHost?: string;
    readonly sshPort?: number;
    /** The generated private key, when the mock accepts only that one. */
    readonly sshKey?: string;
    /** The compute node to name in Jump mode. */
    readonly targetHost?: string;
    readonly gempbaPort: number;
    readonly hostKeyFingerprint?: string;
}

export namespace MockStatus {

    export function stopped(): MockStatus {
        return { running: false, ended: false, clients: 0, warnings: [] };
    }

    /** e.g. `Running · Local on 127.0.0.1:9000 · 1 node, 4 workers · 1 client`. */
    export function summary(status: MockStatus): string {
        if (!status.running || !status.config) {
            return status.ended ? 'Ended: gempba\'s process exited' : 'Stopped';
        }
        const { access } = status.config;
        const shape = MockConfig.shapeOf(status.config);
        const where = access.mode === ConnectionMode.LOCAL ? `Local on 127.0.0.1:${access.gempbaPort}`
            : `${access.mode === ConnectionMode.HOST ? 'Host' : 'Jump'}, SSH on 127.0.0.1:${access.sshPort}`;
        return `Running · ${where} · ${cluster(shape, status.workers)} · ${status.clients} client${status.clients === 1 ? '' : 's'}`;
    }

    function cluster(shape: MockShape, workers: number | undefined): string {
        const total = workers ?? MockShape.totalWorkers(shape);
        return `${shape.nodes} node${shape.nodes === 1 ? '' : 's'}, ${total} workers`;
    }
}
