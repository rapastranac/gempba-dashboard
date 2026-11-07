import { ContextMenuRenderer } from '@theia/core/lib/browser/context-menu-renderer';
import { TabBarToolbarContribution, TabBarToolbarRegistry } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { ACTION_ITEM, codicon, Widget } from '@theia/core/lib/browser/widgets/widget';
import { Emitter } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { RefreshInterval } from '@gempba/core';
import { ObservedIntervals, TelemetryService } from '../common/telemetry-service';
import { LiveTelemetryView } from './live-telemetry-view';
import { TelemetryMenus } from './telemetry-command-contribution';

/**
 * The refresh rate chip on the tab of every live view: a pulse, the refresh rate as set and a chevron. On hover it tells
 * how often frames arrive, and a click opens the live controls. Views only mark themselves (see LiveTelemetryView).
 */
@injectable()
export class RateChipContribution implements TabBarToolbarContribution {

    static readonly ID = 'gempba-rate-chip';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(ContextMenuRenderer) protected readonly contextMenu: ContextMenuRenderer;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    /** The tooltip last drawn, so the toolbars redraw only when it reads differently, not on every frame. */
    protected shownTooltip = '';

    @postConstruct()
    protected init(): void {
        this.telemetry.onIntervalChange(() => this.onDidChangeEmitter.fire());
        this.telemetry.onStateChange(() => this.onDidChangeEmitter.fire());
        this.telemetry.onSnapshot(() => {
            if (this.tooltip() !== this.shownTooltip) {
                this.onDidChangeEmitter.fire();
            }
        });
    }

    registerToolbarItems(toolbar: TabBarToolbarRegistry): void {
        toolbar.registerItem({
            id: RateChipContribution.ID,
            priority: -10,
            isVisible: widget => LiveTelemetryView.is(widget),
            onDidChange: this.onDidChangeEmitter.event,
            render: widget => this.render(widget)
        });
    }

    protected render(widget?: Widget): React.ReactNode {
        this.shownTooltip = this.tooltip();
        return <div key={RateChipContribution.ID} className='item enabled'>
            <div id={RateChipContribution.ID} className={`${ACTION_ITEM} no-icon gempba-rate-chip`} title={this.shownTooltip} role='button' tabIndex={0}
                onClick={event => this.open(event.clientX, event.clientY, event.currentTarget, widget)}
                onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        const box = event.currentTarget.getBoundingClientRect();
                        this.open(box.left, box.bottom, event.currentTarget, widget);
                    }
                }}>
                <span className={codicon('pulse')} />
                <span>{RefreshInterval.label(this.telemetry.intervalMs)}</span>
                <span className={codicon('chevron-down')} />
            </div>
        </div>;
    }

    protected tooltip(): string {
        const arriving = ObservedIntervals.text(this.telemetry.observedIntervals);
        return `Refresh rate ${RefreshInterval.label(this.telemetry.intervalMs)}${arriving ? `; ${arriving}` : ''}. Click for the live controls.`;
    }

    protected open(x: number, y: number, chip: HTMLElement, widget?: Widget): void {
        this.contextMenu.render({ menuPath: TelemetryMenus.CONTROLS, anchor: { x, y }, args: widget ? [widget] : [], context: chip });
    }
}
