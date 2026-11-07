import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { StatusText } from '../common/status-text';
import { RankHistoryService, TelemetryService } from '../common/telemetry-service';
import { TelemetryMenus } from './telemetry-command-contribution';

/**
 * One status-bar entry, its words from {@link StatusText}: while live the nodes, the cluster's tasks a second and the
 * refresh rate; with data held but not live, why and when it is from; else the connection state. On hover it shows the
 * latest status, the run's setup and how often frames arrive; a click opens the live controls.
 */
@injectable()
export class TelemetryStatusBarContribution implements FrontendApplicationContribution {

    static readonly ID = 'gempba-telemetry-status';

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(RankHistoryService) protected readonly rankHistory: RankHistoryService;
    @inject(ContextMenuRenderer) protected readonly contextMenu: ContextMenuRenderer;

    protected shown = '';

    onStart(): void {
        this.update();
        this.telemetry.onStateChange(() => this.update());
        this.telemetry.onStatus(() => this.update());
        this.telemetry.onSnapshot(() => this.update());
        this.telemetry.onIntervalChange(() => this.update());
        this.telemetry.onLinkChange(() => this.update());
        this.telemetry.onClear(() => this.update());
    }

    protected update(): void {
        const throughput = this.rankHistory.clusterThroughput();
        const snapshot = this.telemetry.snapshot;
        const { text, tooltip } = StatusText.of({
            state: this.telemetry.state, condition: this.telemetry.condition, status: this.telemetry.status, nodes: snapshot?.nodes.length,
            throughput: throughput.at(-1), intervalMs: this.telemetry.intervalMs, observed: this.telemetry.observedIntervals, run: snapshot?.run,
            lastFrameAt: this.telemetry.lastFrameAt
        });
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
