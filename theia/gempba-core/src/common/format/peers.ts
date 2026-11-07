import { PeerSnapshot } from '../model/peer-snapshot';
import { Bytes } from './bytes';
import { NumberText } from './number-text';

export namespace Peers {

    /** `N peers · M tasks · X total`, or `none` without outgoing edges. */
    export function summarize(peers: readonly PeerSnapshot[] | undefined): string {
        if (!peers || peers.length === 0) {
            return 'none';
        }
        const totalBytes = peers.reduce((sum, peer) => sum + peer.bytes, 0);
        const totalCount = peers.reduce((sum, peer) => sum + peer.count, 0);
        return `${peers.length} peer${peers.length === 1 ? '' : 's'}`
            + ` · ${NumberText.grouped(totalCount)} task${totalCount === 1 ? '' : 's'}`
            + ` · ${Bytes.human(totalBytes)} total`;
    }
}
