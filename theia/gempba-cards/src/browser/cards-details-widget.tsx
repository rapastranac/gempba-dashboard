import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ConnectionState, RankSnapshot, WorldSnapshot } from '@gempba/core';
import { NodeHistoryService, TelemetryService, RankHistoryService } from '@gempba/telemetry/lib/common';
import { Gauge, HeatStrip, HeroStat, LiveIndicator, LivenessWatch, MeterBar, Panel, Sparkline } from '@gempba/ui/lib/browser';
import { Liveness } from '@gempba/ui/lib/common/liveness';
import { MotionTiming } from '@gempba/ui/lib/common/motion-timing';
import { CardsPanel } from '../common/cards-panel';
import { CardsTreeNode } from './cards-tree';
import { ChartLayouts } from './chart-layouts';
import { PeersDialog } from './peers-dialog';

/** What the details pane shows: the picked row, found again in the latest snapshot. */
interface Shown {
    readonly panel: CardsPanel.Panel;
    readonly icon: string;
    readonly rank?: RankSnapshot;
}

/**
 * The picked row of the Cards tree as a live instrument panel beside it: a gauge and headline figures, history
 * charts, heat strips and bars, then the run's totals. Each figure shows once. The Cards view tells it what to show; the
 * charts follow the saved layout of every rank's or node's panel.
 */
@injectable()
export class CardsDetailsWidget extends ReactWidget {

    static readonly ID = 'gempba-cards-details';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(NodeHistoryService) protected readonly nodeHistory: NodeHistoryService;
    @inject(RankHistoryService) protected readonly rankHistory: RankHistoryService;
    @inject(ChartLayouts) protected readonly layouts: ChartLayouts;

    protected snapshot: WorldSnapshot | undefined;
    protected row: CardsTreeNode | undefined;
    protected readonly liveness = new LivenessWatch(this, () => this.streamLiveness(), () => this.update());

    protected readonly histories: CardsPanel.Histories = {
        node: host => this.nodeHistory.seriesFor(host),
        rank: id => this.rankHistory.seriesFor(id),
        throughput: host => this.rankHistory.throughputFor(host),
        counts: host => this.rankHistory.countsFor(host)
    };

    @postConstruct()
    protected init(): void {
        this.id = CardsDetailsWidget.ID;
        this.addClass('gempba-cards-details');
        this.scrollOptions = { suppressScrollX: true };
        this.toDispose.push(this.liveness);
        this.toDispose.push(this.layouts.onChange(() => this.update()));
    }

    showDetails(snapshot: WorldSnapshot | undefined, row: CardsTreeNode | undefined): void {
        this.snapshot = snapshot;
        this.row = row;
        this.update();
    }

    protected render(): React.ReactNode {
        const shown = this.find();
        if (!shown) {
            this.liveness.none();
            return <p className='gempba-cards-empty'>Pick a node, socket or rank to see its details.</p>;
        }
        const { panel, icon, rank } = shown;
        return <div className='gempba-cards-panel' style={{ '--gempba-motion-duration': `${this.motionMs()}ms` } as React.CSSProperties}>
            <header className='gempba-cards-details-header'>
                <div>
                    <div className='gempba-cards-details-title'>
                        <span className={`${icon} gempba-cards-icon`} />
                        <span>{panel.title}</span>
                    </div>
                    <div className='gempba-cards-details-subtitle'>{panel.subtitle}</div>
                </div>
                <LiveIndicator liveness={this.liveness.drawn(this.streamLiveness())} />
            </header>
            <div className='gempba-cards-heroes'>
                {panel.gauge && <Gauge {...panel.gauge} />}
                {panel.heroes.map(hero => <HeroStat key={hero.label} {...hero} />)}
            </div>
            {panel.charts.length > 0 && <div className='gempba-cards-charts'>
                {panel.charts.map(chart => <Panel key={chart.key} title={chart.title}
                    actions={chart.unavailable ? undefined : <span className='gempba-cards-latest' title={chart.hint}>{chart.latest}</span>}>
                    {chart.unavailable
                        ? <p className='gempba-cards-chart-unavailable'>{chart.unavailable}</p>
                        : <Sparkline values={chart.values} max={chart.max} capacity={chart.capacity} tone={chart.tone} label={`${chart.title} of ${panel.title}`} />}
                </Panel>)}
            </div>}
            {panel.strips.map(strip => <Panel key={strip.title} title={`${strip.title}: load per CPU`}>
                <HeatStrip cells={strip.cells} label={`Estimated load on each CPU of ${strip.title}`} />
            </Panel>)}
            {panel.bars.map(bars => <Panel key={bars.title} title={bars.title} actions={bars.peers && rank ? this.renderViewAll(rank) : undefined}>
                {bars.rows.map(bar => <div key={bar.label} className='gempba-cards-bar'>
                    <span className='gempba-cards-bar-label'>{bar.label}</span>
                    <MeterBar fraction={bar.fraction} tone={bar.tone} label={`${bars.title}: ${bar.label}`} />
                    <span className='gempba-cards-bar-value'>{bar.valueText}</span>
                </div>)}
            </Panel>)}
            {panel.totals.length > 0 && <Panel title='Run so far'>
                <table className='gempba-property-sheet'>
                    <tbody>
                        {panel.totals.map(total => <tr key={total.label}>
                            <th className='gempba-property-label' scope='row' title={total.hint}>{total.label}</th>
                            <td className='gempba-property-value'>{total.value}</td>
                        </tr>)}
                    </tbody>
                </table>
            </Panel>}
        </div>;
    }

    protected renderViewAll(rank: RankSnapshot): React.ReactNode {
        return <button className='theia-button secondary gempba-cards-view-all'
            title='Every outgoing peer, the tasks sent to it and the bytes, as of now; reopen for fresh numbers.'
            onClick={() => this.openPeers(rank)}>View all…</button>;
    }

    protected openPeers(rank: RankSnapshot): void {
        new PeersDialog(rank, this.snapshot).open();
    }

    protected streamLiveness(): Liveness {
        return Liveness.of({
            streaming: this.telemetry.state === ConnectionState.LISTENING,
            lastFrameAt: this.telemetry.lastFrameAt,
            lastLineAt: this.telemetry.lastLineAt,
            paused: this.telemetry.snapshot?.paused,
            ended: this.telemetry.snapshot?.final,
            now: Date.now(),
            intervalMs: this.telemetry.intervalMs
        });
    }

    protected motionMs(): number {
        return MotionTiming.durationMs(this.telemetry.intervalMs, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    protected find(): Shown | undefined {
        const row = this.row;
        const node = row && this.snapshot?.nodes.find(candidate => candidate.host === row.host);
        if (!row || !node) {
            return undefined;
        }
        if (row.kind === 'node') {
            return { panel: CardsPanel.forNode(node, this.histories, this.layouts.get('node')), icon: codicon('server') };
        }
        const socket = node.sockets.find(candidate => candidate.socketId === row.socketId);
        if (!socket) {
            return undefined;
        }
        if (row.kind === 'socket') {
            return { panel: CardsPanel.forSocket(node, socket), icon: codicon('circuit-board') };
        }
        const rank = socket.ranks.find(candidate => candidate.id === row.rank);
        return rank && {
            panel: CardsPanel.forRank(this.snapshot, socket, rank, this.histories, this.layouts.get('rank')), icon: codicon(rank.sentinel ? 'star-full' : 'gear'), rank
        };
    }
}
