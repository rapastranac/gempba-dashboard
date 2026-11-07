import { ReactDialog } from '@theia/core/lib/browser/dialogs/react-dialog';
import * as React from '@theia/core/shared/react';
import { Peers, RankSnapshot, WorldSnapshot } from '@gempba/core';
import { DataTable } from '@gempba/ui/lib/browser';
import { CardsText } from '../common/cards-text';

const COLUMNS = [{ label: 'Peer' }, { label: 'Host' }, { label: 'Tasks sent', align: 'end' as const }, { label: 'Bytes', align: 'end' as const }];

/**
 * Every outgoing peer of one rank, busiest first, as the snapshot held them when the dialog opened (like the
 * Java dialog): live frames keep flowing behind it, and reopening it shows fresh numbers.
 */
export class PeersDialog extends ReactDialog<void> {

    protected readonly rows: CardsText.PeerRow[];
    protected readonly total: string;

    constructor(rank: RankSnapshot, world: WorldSnapshot | undefined) {
        super({ title: `Outgoing peers — Rank ${rank.id}`, maxWidth: 640 });
        this.rows = CardsText.peerRows(rank, world);
        this.total = `Total: ${Peers.summarize(rank.peers)}`;
        this.appendAcceptButton('OK');
        this.contentNode.classList.add('gempba-peers-dialog');
    }

    get value(): void {
        return undefined;
    }

    protected render(): React.ReactNode {
        return <>
            <div className='gempba-peers-table'>
                <DataTable columns={COLUMNS} rows={this.rows.map(row => [row.peer, row.host, row.tasks, row.bytes])} />
            </div>
            <div className='gempba-peers-total'>{this.total}</div>
        </>;
    }
}
