import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { codicon } from '@theia/core/lib/browser/widgets/widget';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { WorkerSnapshot, WorldSnapshot } from '@gempba/core';
import { NodeHistoryService } from '@gempba/telemetry/lib/common';
import { PropertySection, PropertySheet } from '@gempba/ui/lib/browser';
import { CardsText } from '../common/cards-text';
import { CardsTreeNode } from './cards-tree';
import { PeersDialog } from './peers-dialog';

/** What the details pane shows: the picked row, found again in the latest snapshot. */
interface Shown {
    readonly details: CardsText.Details;
    readonly icon: string;
    readonly worker?: WorkerSnapshot;
}

/** The details of the row picked in the Cards tree, beside it. The Cards view tells it what to show. */
@injectable()
export class CardsDetailsWidget extends ReactWidget {

    static readonly ID = 'gempba-cards-details';

    @inject(NodeHistoryService) protected readonly history: NodeHistoryService;

    protected snapshot: WorldSnapshot | undefined;
    protected row: CardsTreeNode | undefined;

    @postConstruct()
    protected init(): void {
        this.id = CardsDetailsWidget.ID;
        this.addClass('gempba-cards-details');
        this.scrollOptions = { suppressScrollX: true };
    }

    showDetails(snapshot: WorldSnapshot | undefined, row: CardsTreeNode | undefined): void {
        this.snapshot = snapshot;
        this.row = row;
        this.update();
    }

    protected render(): React.ReactNode {
        const shown = this.find();
        if (!shown) {
            return <p className='gempba-cards-empty'>Pick a node, socket or worker to see its details.</p>;
        }
        const { details, icon, worker } = shown;
        const sections: PropertySection[] = details.sections.map(section => ({
            title: section.title,
            rows: section.rows.map(row => ({ label: row.label, value: this.renderValue(row, worker) }))
        }));
        return <>
            <div className='gempba-cards-details-title'>
                <span className={`${icon} gempba-cards-icon`} />
                <span>{details.title}</span>
            </div>
            <div className='gempba-cards-details-subtitle'>{details.subtitle}</div>
            <PropertySheet sections={sections} />
        </>;
    }

    protected renderValue(row: CardsText.Row, worker: WorkerSnapshot | undefined): React.ReactNode {
        if (row.label !== CardsText.OUTGOING_PEERS || !worker || worker.peers.length === 0) {
            return row.value;
        }
        return <span className='gempba-cards-peers'>
            {row.value}
            <button className='theia-button secondary' title='Every outgoing peer, the tasks sent to it and the bytes, as of now; reopen for fresh numbers.'
                onClick={() => this.openPeers(worker)}>View all…</button>
        </span>;
    }

    protected openPeers(worker: WorkerSnapshot): void {
        new PeersDialog(worker, this.snapshot).open();
    }

    protected find(): Shown | undefined {
        const row = this.row;
        const node = row && this.snapshot?.nodes.find(candidate => candidate.host === row.host);
        if (!row || !node) {
            return undefined;
        }
        if (row.kind === 'node') {
            return { details: CardsText.nodeDetails(node, this.history.seriesFor(node.host)), icon: codicon('server') };
        }
        const socket = node.sockets.find(candidate => candidate.socketId === row.socketId);
        if (!socket) {
            return undefined;
        }
        if (row.kind === 'socket') {
            return { details: CardsText.socketDetails(node.host, socket), icon: codicon('circuit-board') };
        }
        const worker = socket.workers.find(candidate => candidate.workerId === row.workerId);
        return worker && { details: CardsText.workerDetails(node.host, worker), icon: codicon(worker.sentinel ? 'star-full' : 'gear'), worker };
    }
}
