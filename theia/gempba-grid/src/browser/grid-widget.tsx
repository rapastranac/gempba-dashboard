import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { NodeHistoryService, NodeSelection, TelemetryService } from '@gempba/telemetry/lib/common';
import { MeterBar, Sparkline, Tile, TileGrid, VisibleRefresh } from '@gempba/ui/lib/browser';
import { GridTiles } from '../common/grid-tiles';

const CPU_TOOLTIP = 'CPU utilization of this node\'s gempba allocation (0–100%): your processes\' CPU divided by the cores '
    + 'allocated to them. Other users\' load on a shared node is excluded. Click to select the node.';

/**
 * One Task Manager style tile per node: its utilization now, its CPU history and its memory. Picking a tile
 * publishes a NodeSelection, and a node selected elsewhere is highlighted here.
 */
@injectable()
export class GridWidget extends ReactWidget {

    static readonly ID = 'gempba-grid';
    static readonly LABEL = 'Grid';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(NodeHistoryService) protected readonly history: NodeHistoryService;
    @inject(SelectionService) protected readonly selection: SelectionService;

    @postConstruct()
    protected init(): void {
        this.id = GridWidget.ID;
        this.title.label = GridWidget.LABEL;
        this.title.caption = 'GemPBA nodes';
        this.title.iconClass = codicon('dashboard');
        this.title.closable = false;
        this.scrollOptions = {};
        this.addClass('gempba-grid');
        // Snapshots arrive several times a second; a hidden Grid (a background tab, a minimized window) draws nothing until it is shown.
        const refresh = new VisibleRefresh(this, () => this.update());
        this.toDispose.push(refresh);
        this.toDispose.push(this.telemetry.onSnapshot(() => refresh.request()));
        this.toDispose.push(this.telemetry.onStateChange(() => refresh.request()));
        this.toDispose.push(this.selection.onSelectionChanged(() => refresh.request()));
        this.update();
    }

    protected render(): React.ReactNode {
        const tiles = GridTiles.of(this.telemetry.snapshot, this.history);
        if (tiles.length === 0) {
            return <p className='gempba-grid-empty'>No nodes yet. Listen to a gempba center to see one tile per node here.</p>;
        }
        const current = this.selection.selection;
        const selectedHost = NodeSelection.is(current) ? current.host : undefined;
        return <TileGrid>
            {tiles.map(tile => <Tile key={tile.host} title={tile.host} readout={tile.cpuText} tooltip={CPU_TOOLTIP}
                selected={tile.host === selectedHost} onSelect={() => this.selection.selection = NodeSelection.of(tile.host)}>
                <Sparkline values={tile.cpuHistory} max={100} capacity={GridTiles.HISTORY_CAPACITY} tone='cpu' label={`CPU history of ${tile.host}`} />
                <span className='gempba-tile-caption'>{tile.memoryText}</span>
                <MeterBar fraction={tile.memoryFraction} tone='memory' label={`Memory of ${tile.host}`} />
            </Tile>)}
        </TileGrid>;
    }
}
