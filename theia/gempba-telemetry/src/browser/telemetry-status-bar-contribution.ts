import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConnectionState, Rates } from '@gempba/core';
import { TelemetryService, WorkerHistoryService } from '../common/telemetry-service';

/** One status-bar entry: the connection state, the node count while streaming, and on hover the latest status and the run's tasks per second. */
@injectable()
export class TelemetryStatusBarContribution implements FrontendApplicationContribution {

    static readonly ID = 'gempba-telemetry-status';

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(WorkerHistoryService) protected readonly workerHistory: WorkerHistoryService;

    protected shown = '';

    onStart(): void {
        this.update();
        this.telemetry.onStateChange(() => this.update());
        this.telemetry.onStatus(() => this.update());
        this.telemetry.onSnapshot(() => this.update());
    }

    protected update(): void {
        const state = this.telemetry.state;
        const listening = state === ConnectionState.LISTENING;
        const nodes = this.telemetry.snapshot?.nodes.length;
        const text = listening && nodes !== undefined
            ? `$(pulse) GemPBA: ${nodes} ${nodes === 1 ? 'node' : 'nodes'}`
            : `$(plug) GemPBA: ${state.toLowerCase()}`;
        const lines = [this.telemetry.status || state.toLowerCase()];
        const throughput = this.workerHistory.clusterThroughput();
        if (listening && throughput.length > 0) {
            lines.push(`Tasks completed: ${Rates.perSecond(throughput[throughput.length - 1])}`);
        }
        lines.push('Run the GemPBA commands from the command palette (F1).');
        const tooltip = lines.join('\n');
        if (text + tooltip === this.shown) {
            return;
        }
        this.shown = text + tooltip;
        this.statusBar.setElement(TelemetryStatusBarContribution.ID, { text, tooltip, alignment: StatusBarAlignment.LEFT, priority: 100 });
    }
}
