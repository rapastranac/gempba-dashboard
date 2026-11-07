import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Emitter } from '@theia/core/lib/common/event';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConnectionMode, ConnectionState, SessionSpec, TargetSpec } from '@gempba/core';
import { TelemetryService } from '@gempba/telemetry/lib/common';
import { MockConfig, MockLive } from '../common/mock-config';
import { MockFault } from '../common/mock-fault';
import { MockLogLine, MockServer, MockStatus } from '../common/mock-protocol';
import { MockClientImpl } from './mock-client-impl';

/** This window's view of the app's one mock, shared by the panel, the commands and the status bar. */
@injectable()
export class MockController implements FrontendApplicationContribution {

    static readonly LOG_LINES = 200;

    @inject(MockServer) protected readonly server: MockServer;
    @inject(MockClientImpl) protected readonly client: MockClientImpl;
    @inject(TelemetryService) protected readonly telemetry: TelemetryService;

    protected statusNow = MockStatus.stopped();
    protected lines: MockLogLine[] = [];
    /** This window streams the mock because it connected here; set once Connect completes, cleared when the window disconnects. */
    protected connectedHere = false;
    protected connecting = false;
    protected readonly onStatusEmitter = new Emitter<MockStatus>();
    protected readonly onLogEmitter = new Emitter<void>();
    readonly onStatus = this.onStatusEmitter.event;
    readonly onLog = this.onLogEmitter.event;

    get status(): MockStatus {
        return this.statusNow;
    }

    get log(): readonly MockLogLine[] {
        return this.lines;
    }

    /**
     * Whether this window streams the running mock. Only a Connect from here counts: the hub doesn't say what a
     * window streams, so a connection made by hand in the Connection view isn't recognized.
     */
    get connected(): boolean {
        return this.connectedHere && this.statusNow.running && this.telemetry.state !== ConnectionState.DISCONNECTED;
    }

    onStart(): void {
        this.telemetry.onStateChange(state => {
            if (state === ConnectionState.DISCONNECTED && !this.connecting) {
                this.connectedHere = false;
            }
            this.onStatusEmitter.fire(this.statusNow);
        });
        this.client.statuses(status => this.show(status));
        this.client.logs(line => {
            this.lines = [...this.lines, line].slice(-MockController.LOG_LINES);
            this.onLogEmitter.fire();
        });
        Promise.all([this.server.status(), this.server.recentLog()]).then(([status, lines]) => {
            this.lines = [...lines];
            this.onLogEmitter.fire();
            this.show(status);
        });
    }

    lastConfig(): Promise<MockConfig> {
        return this.server.lastConfig();
    }

    async start(config: MockConfig): Promise<MockStatus> {
        const status = await this.server.start(config);
        this.show(status);
        return status;
    }

    stop(): Promise<void> {
        return this.server.stop();
    }

    setLive(live: MockLive): Promise<void> {
        return this.server.setLive(live);
    }

    fault(fault: MockFault): Promise<string> {
        return this.server.fault(fault);
    }

    async clearLog(): Promise<void> {
        await this.server.clearLog();
        this.lines = [];
        this.onLogEmitter.fire();
    }

    /** Points this window at the running mock, closing whatever it streamed from before. */
    async connect(): Promise<void> {
        const reach = this.statusNow.reach;
        if (!this.statusNow.running || !reach) {
            throw new Error('The mock is not running.');
        }
        this.connecting = true;
        try {
            if (this.telemetry.state !== ConnectionState.DISCONNECTED) {
                await this.telemetry.disconnect();
            }
            if (reach.mode !== ConnectionMode.LOCAL) {
                await this.telemetry.connect(SessionSpec.of({ mode: reach.mode, host: reach.sshHost, sshPort: reach.sshPort, sshKey: reach.sshKey ?? '' }));
            }
            await this.telemetry.listen(TargetSpec.of(reach.targetHost, reach.gempbaPort));
            this.connectedHere = true;
        } finally {
            this.connecting = false;
            this.onStatusEmitter.fire(this.statusNow);
        }
    }

    /** Ends this window's stream from the mock, and its SSH session in Host and Jump; the mock keeps running. */
    async disconnect(): Promise<void> {
        this.connectedHere = false;
        await this.telemetry.disconnect();
        this.onStatusEmitter.fire(this.statusNow);
    }

    protected show(status: MockStatus): void {
        this.statusNow = status;
        if (!status.running) {
            this.connectedHere = false;
        }
        this.onStatusEmitter.fire(status);
    }
}
