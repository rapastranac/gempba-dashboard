import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ConnectionState } from '@gempba/core';
import { TelemetryService } from '../common/telemetry-service';

/** One status-bar entry: the connection state, the node count while streaming, the latest status on hover. */
@injectable()
export class TelemetryStatusBarContribution implements FrontendApplicationContribution {

    static readonly ID = 'gempba-telemetry-status';

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(TelemetryService) protected readonly telemetry: TelemetryService;

    protected shown = '';

    onStart(): void {
        this.update();
        this.telemetry.onStateChange(() => this.update());
        this.telemetry.onStatus(() => this.update());
        this.telemetry.onSnapshot(() => this.update());
    }

    protected update(): void {
        const state = this.telemetry.state;
        const nodes = this.telemetry.snapshot?.nodes.length;
        const text = state === ConnectionState.LISTENING && nodes !== undefined
            ? `$(pulse) GemPBA: ${nodes} ${nodes === 1 ? 'node' : 'nodes'}`
            : `$(plug) GemPBA: ${state.toLowerCase()}`;
        const tooltip = `${this.telemetry.status || state.toLowerCase()}\nRun the GemPBA commands from the command palette (F1).`;
        if (text + tooltip === this.shown) {
            return;
        }
        this.shown = text + tooltip;
        this.statusBar.setElement(TelemetryStatusBarContribution.ID, { text, tooltip, alignment: StatusBarAlignment.LEFT, priority: 100 });
    }
}
