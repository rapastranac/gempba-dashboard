import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConnectionState, Rates, RefreshInterval } from '@gempba/core';
import { TelemetryService, WorkerHistoryService } from '../common/telemetry-service';
import { TelemetryMenus } from './telemetry-command-contribution';

/**
 * One status-bar entry: the connection state, and while streaming the node count and the worker refresh rate. On hover
 * it shows the latest status, the run's tasks per second and how often frames arrive; a click opens the live controls.
 */
@injectable()
export class TelemetryStatusBarContribution implements FrontendApplicationContribution {

    static readonly ID = 'gempba-telemetry-status';

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(WorkerHistoryService) protected readonly workerHistory: WorkerHistoryService;
    @inject(ContextMenuRenderer) protected readonly contextMenu: ContextMenuRenderer;

    protected shown = '';

    onStart(): void {
        this.update();
        this.telemetry.onStateChange(() => this.update());
        this.telemetry.onStatus(() => this.update());
        this.telemetry.onSnapshot(() => this.update());
        this.telemetry.onRatesChange(() => this.update());
    }

    protected update(): void {
        const state = this.telemetry.state;
        const listening = state === ConnectionState.LISTENING;
        const nodes = this.telemetry.snapshot?.nodes.length;
        const rate = RefreshInterval.label(this.telemetry.rates.workerIntervalMs);
        const text = listening && nodes !== undefined
            ? `$(pulse) GemPBA: ${nodes} ${nodes === 1 ? 'node' : 'nodes'} · ${rate}`
            : `$(plug) GemPBA: ${state.toLowerCase()}`;
        const lines = [this.telemetry.status || state.toLowerCase()];
        const throughput = this.workerHistory.clusterThroughput();
        if (listening && throughput.length > 0) {
            lines.push(`Tasks completed: ${Rates.text(throughput[throughput.length - 1])}`);
        }
        const observed = this.telemetry.observedRates.workerIntervalMs;
        lines.push(`Worker frames every ${rate}${listening && observed !== undefined ? `, arriving every ${RefreshInterval.label(observed)}` : ''}`);
        lines.push('Click for the refresh rates; the other GemPBA commands are in the command palette (F1).');
        const tooltip = lines.join('\n');
        if (text + tooltip === this.shown) {
            return;
        }
        this.shown = text + tooltip;
        this.statusBar.setElement(TelemetryStatusBarContribution.ID, {
            text, tooltip, alignment: StatusBarAlignment.LEFT, priority: 100, onclick: event => this.openControls(event)
        });
    }

    protected openControls(event: MouseEvent): void {
        this.contextMenu.render({ menuPath: TelemetryMenus.CONTROLS, anchor: { x: event.clientX, y: event.clientY }, context: event.target as HTMLElement });
    }
}
