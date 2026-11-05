import { open, OpenerService } from '@theia/core/lib/browser/opener-service';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandService } from '@theia/core/lib/common/command';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ConnectionState, RankHistoryStore } from '@gempba/core';
import { LiveTelemetryView, TelemetryCommands } from '@gempba/telemetry/lib/browser';
import { NodeHistoryService, NodeLink, NodeSelection, TelemetryService, RankHistoryService } from '@gempba/telemetry/lib/common';
import { EmptyState, HeroStat, LiveIndicator, LivenessWatch, MeterBar, Sparkline, Tile, TileGrid, VisibleRefresh } from '@gempba/ui/lib/browser';
import { MotionTiming } from '@gempba/ui/lib/common/motion-timing';
import { GridFigure, GridOverview, GridTile, GridTiles } from '../common/grid-tiles';

/** A headline figure, with its meter under it when it has one. */
function Figure({ figure, of }: { readonly figure: GridFigure, readonly of: string }): React.ReactElement {
    const { meter, ...stat } = figure;
    return <div className='gempba-grid-figure'>
        <HeroStat {...stat} />
        {meter !== undefined && <MeterBar fraction={meter} tone={figure.tone ?? 'memory'} label={`${figure.label} of ${of}`} />}
    </div>;
}

const CPU_TOOLTIP = 'CPU utilization of this node\'s gempba allocation (0–100%): your processes\' CPU divided by the cores '
    + 'allocated to them. Other users\' load on a shared node is excluded. Click to select the node; double-click or press Enter to open it.';

/**
 * The cluster at a glance: an overview of the whole run above one Task Manager style tile per node, each with its
 * CPU and history, its tasks started, its memory, the tasks it moved, and whether its own ranks still send frames. Picking a tile
 * publishes a NodeSelection, and a node selected elsewhere is highlighted here. Opening a tile opens its node's
 * NodeLink, in whichever view registered to open nodes.
 */
@injectable()
export class GridWidget extends ReactWidget {

    static readonly ID = 'gempba-grid';
    static readonly LABEL = 'Grid';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(NodeHistoryService) protected readonly nodeHistory: NodeHistoryService;
    @inject(RankHistoryService) protected readonly rankHistory: RankHistoryService;
    @inject(SelectionService) protected readonly selection: SelectionService;
    @inject(OpenerService) protected readonly openers: OpenerService;
    @inject(CommandService) protected readonly commands: CommandService;

    protected readonly sources: GridTiles.Sources = {
        node: host => this.nodeHistory.seriesFor(host),
        throughput: host => this.rankHistory.throughputFor(host),
        clusterThroughput: () => this.rankHistory.clusterThroughput(),
        rank: id => this.rankHistory.seriesFor(id),
        nodeFrameAt: host => this.telemetry.nodeFrameAt(host),
        lastFrameAt: () => this.telemetry.lastFrameAt,
        lastLineAt: () => this.telemetry.lastLineAt
    };

    protected readonly liveness = new LivenessWatch(this, () => {
        const clock = this.clock();
        return GridWidget.livenessOf(GridTiles.overview(this.telemetry.snapshot, this.sources, clock),
            GridTiles.of(this.telemetry.snapshot, this.sources, clock));
    }, () => this.update());

    @postConstruct()
    protected init(): void {
        this.id = GridWidget.ID;
        this.title.label = GridWidget.LABEL;
        this.title.caption = 'GemPBA nodes';
        this.title.iconClass = codicon('dashboard');
        this.title.closable = false;
        this.scrollOptions = {};
        this.addClass('gempba-grid');
        LiveTelemetryView.mark(this);
        // Snapshots arrive several times a second; a hidden Grid (a background tab, a minimized window) draws nothing until it is shown.
        const refresh = new VisibleRefresh(this, () => this.update());
        this.toDispose.push(refresh);
        this.toDispose.push(this.liveness);
        this.toDispose.push(this.telemetry.onSnapshot(() => refresh.request()));
        this.toDispose.push(this.telemetry.onStateChange(() => refresh.request()));
        this.toDispose.push(this.selection.onSelectionChanged(() => refresh.request()));
        this.update();
    }

    protected render(): React.ReactNode {
        const clock = this.clock();
        const overview = GridTiles.overview(this.telemetry.snapshot, this.sources, clock);
        if (!overview) {
            this.liveness.none();
            return <EmptyState icon='dashboard' title='No nodes yet'
                message='Listen to a gempba run on this machine, or connect to a cluster, to see one tile per node here.' actions={[
                    { label: TelemetryCommands.LISTEN.label!, run: () => this.commands.executeCommand(TelemetryCommands.LISTEN.id), primary: true },
                    { label: TelemetryCommands.CONNECT.label!, run: () => this.commands.executeCommand(TelemetryCommands.CONNECT.id) }
                ]} />;
        }
        const tiles = GridTiles.of(this.telemetry.snapshot, this.sources, clock);
        this.liveness.drawn(GridWidget.livenessOf(overview, tiles));
        const current = this.selection.selection;
        const selectedHost = NodeSelection.is(current) ? current.host : undefined;
        return <div className='gempba-grid-view' style={{ '--gempba-motion-duration': `${this.motionMs()}ms` } as React.CSSProperties}>
            {this.renderOverview(overview)}
            <TileGrid>
                {tiles.map(tile => this.renderTile(tile, tile.host === selectedHost))}
            </TileGrid>
        </div>;
    }

    protected renderOverview(overview: GridOverview): React.ReactNode {
        return <section className='gempba-grid-overview' aria-label='Cluster'>
            <header className='gempba-grid-overview-header'>
                <span className='gempba-grid-overview-summary'>{overview.summary}</span>
                <LiveIndicator liveness={overview.liveness} />
            </header>
            <div className='gempba-grid-overview-body'>
                {overview.figures.map(figure => <Figure key={figure.label} figure={figure} of='the cluster' />)}
                <div className='gempba-grid-overview-chart'>
                    <span className='gempba-hero-label'>{overview.throughputTitle}</span>
                    <Sparkline values={overview.throughput} capacity={RankHistoryStore.CAPACITY} tone='tasks' label={`${overview.throughputTitle} by the cluster`} />
                </div>
            </div>
        </section>;
    }

    protected renderTile(tile: GridTile, selected: boolean): React.ReactNode {
        return <Tile key={tile.host} title={tile.host} readout={tile.cpuText} tooltip={CPU_TOOLTIP} selected={selected} dimmed={tile.liveness === 'stale'}
            status={<LiveIndicator liveness={tile.liveness} compact={true} />}
            onSelect={() => this.selection.selection = NodeSelection.of(tile.host)} onOpen={() => this.openNode(tile.host)}>
            <Sparkline values={tile.cpuHistory} max={100} capacity={GridTiles.HISTORY_CAPACITY} tone='cpu' label={`CPU history of ${tile.host}`} />
            <div className='gempba-grid-tile-figures'>
                <Figure figure={tile.tasks} of={tile.host} />
                {tile.memory && <Figure figure={tile.memory} of={tile.host} />}
            </div>
            {tile.moved && <span className='gempba-tile-caption gempba-grid-moved' title={tile.moved.hint}>
                <span className='codicon codicon-arrow-swap' aria-hidden={true} />
                {tile.moved.text}
            </span>}
        </Tile>;
    }

    protected clock(): GridTiles.Clock {
        return { streaming: this.telemetry.state === ConnectionState.LISTENING, now: Date.now(), intervalMs: this.telemetry.rates.workerIntervalMs };
    }

    protected motionMs(): number {
        return MotionTiming.durationMs(this.telemetry.rates.workerIntervalMs, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    /** Opens the node in whichever view registered for node links; with none, the hub's fallback opens nothing. */
    protected openNode(host: string): void {
        open(this.openers, NodeLink.of(host));
    }

    /** What the view's liveness shows, the stream's and every tile's, as one key to tell when it changed. */
    protected static livenessOf(overview: GridOverview | undefined, tiles: readonly GridTile[]): string {
        return [overview?.liveness, ...tiles.map(tile => tile.liveness)].join(' ');
    }
}
