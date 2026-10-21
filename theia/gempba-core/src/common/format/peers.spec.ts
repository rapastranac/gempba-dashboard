import { expect } from 'chai';
import { Peers } from './peers';

describe('Peers', () => {

    it('no edges is none', () => {
        expect(Peers.summarize([])).to.equal('none');
        expect(Peers.summarize(undefined)).to.equal('none');
    });

    it('a single edge uses singular nouns', () => {
        expect(Peers.summarize([{ peerWorkerId: 2, bytes: 1536, count: 1 }])).to.equal('1 peer · 1 task · 1.5 KB total');
    });

    it('several edges sum tasks and bytes', () => {
        const peers = [{ peerWorkerId: 1, bytes: 524_288, count: 1_200 }, { peerWorkerId: 3, bytes: 524_288, count: 34 }];
        expect(Peers.summarize(peers)).to.equal('2 peers · 1,234 tasks · 1.0 MB total');
    });
});
