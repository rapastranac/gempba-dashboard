import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ConnectionState, WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { NodeHistoryService, TelemetryService, WorkerHistoryService } from '@gempba/telemetry/lib/common';
import { Gauge, HeatStrip, HeroStat, LiveIndicator, LivenessWatch, MeterBar, Panel, Sparkline } from '@gempba/ui/lib/browser';
import { Liveness } from '@gempba/ui/lib/common/liveness';
import { MotionTiming } from '@gempba/ui/lib/common/motion-timing';
import { CardsPanel } from '../common/cards-panel';
import { CardsTreeNode } from './cards-tree';
import { PeersDialog } from './peers-dialog';

/** What the details pane shows: the picked row, found again in the latest snapshot. */
interface Shown {
    readonly panel: CardsPanel.Panel;
    readonly icon: string;
    readonly worker?: WorkerSnapshot;
}

/**
 * The picked row of the Cards tree as a live instrument panel beside it: a gauge and headline figures, history
 * charts, heat strips and bars, then the run's totals. Each figure shows once. The Cards view tells it what to show.
 */
@injectable()
export class CardsDetailsWidget extends ReactWidget {

    static readonly ID = 'gempba-cards-details';

    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(NodeHistoryService) protected readonly nodeHistory: NodeHistoryService;
    @inject(WorkerHistoryService) protected readonly workerHistory: WorkerHistoryService;

    protected snapshot: WorldSnapshot | undefined;
    protected row: CardsTreeNode | undefined;
    protected readonly liveness = new LivenessWatch(this, () => this.streamLiveness(), () => this.update());

    protected readonly histories: CardsPanel.Histories = {
        node: host => this.nodeHistory.seriesFor(host),
        worker: workerId => this.workerHistory.seriesFor(workerId),
        throughput: host => this.workerHistory.throughputFor(host)
    };

    @postConstruct()
    protected init(): void {
        this.id = CardsDetailsWidget.ID;
        this.addClass('gempba-cards-details');
        this.scrollOptions = { suppressScrollX: true };
        this.toDispose.push(this.liveness);
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
            return <p className='gempba-cards-empty'>Pick a node, socket or worker to see its details.</p>;
        }
        const { panel, icon, worker } = shown;
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
                {panel.charts.map(chart => <Panel key={chart.title} title={chart.title} actions={<span className='gempba-cards-latest'>{chart.latest}</span>}>
                    <Sparkline values={chart.values} max={chart.max} capacity={chart.capacity} tone={chart.tone} label={`${chart.title} of ${panel.title}`} />
                </Panel>)}
            </div>}
            {panel.strips.map(strip => <Panel key={strip.title} title={`${strip.title}: load per CPU`}>
                <HeatStrip cells={strip.cells} label={`Estimated load on each CPU of ${strip.title}`} />
            </Panel>)}
            {panel.bars.map(bars => <Panel key={bars.title} title={bars.title} actions={bars.peers && worker ? this.renderViewAll(worker) : undefined}>
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

    protected renderViewAll(worker: WorkerSnapshot): React.ReactNode {
        return <button className='theia-button secondary gempba-cards-view-all'
            title='Every outgoing peer, the tasks sent to it and the bytes, as of now; reopen for fresh numbers.'
            onClick={() => this.openPeers(worker)}>View all…</button>;
    }

    protected openPeers(worker: WorkerSnapshot): void {
        new PeersDialog(worker, this.snapshot).open();
    }

    protected streamLiveness(): Liveness {
        return Liveness.of({
            streaming: this.telemetry.state === ConnectionState.LISTENING,
            lastFrameAt: this.telemetry.lastFrameAt,
            now: Date.now(),
            intervalMs: this.telemetry.rates.workerIntervalMs
        });
    }

    protected motionMs(): number {
        return MotionTiming.durationMs(this.telemetry.rates.workerIntervalMs, window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }

    protected find(): Shown | undefined {
        const row = this.row;
        const node = row && this.snapshot?.nodes.find(candidate => candidate.host === row.host);
        if (!row || !node) {
            return undefined;
        }
        if (row.kind === 'node') {
            return { panel: CardsPanel.forNode(node, this.histories), icon: codicon('server') };
        }
        const socket = node.sockets.find(candidate => candidate.socketId === row.socketId);
        if (!socket) {
            return undefined;
        }
        if (row.kind === 'socket') {
            return { panel: CardsPanel.forSocket(node, socket), icon: codicon('circuit-board') };
        }
        const worker = socket.workers.find(candidate => candidate.workerId === row.workerId);
        return worker && { panel: CardsPanel.forWorker(this.snapshot, socket, worker, this.histories), icon: codicon(worker.sentinel ? 'star-full' : 'gear'), worker };
    }
}
