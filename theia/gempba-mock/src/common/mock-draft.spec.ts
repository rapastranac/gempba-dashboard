import { expect } from 'chai';
import { ConnectionMode } from '@gempba/core';
import { MockConfig } from './mock-config';
import { MockDraft } from './mock-draft';
import { MockStatus } from './mock-protocol';

describe('MockDraft', () => {

    it('turns a configuration into the panel\'s fields and back', () => {
        const config = { ...MockConfig.defaults(), seed: 7 };
        const draft = MockDraft.of(config);
        expect(draft.counts.ranksPerNode).to.equal('4');
        expect(draft.seed).to.equal('7');
        expect(draft.coordinatorRank).to.equal('0');
        expect(MockDraft.toConfig(draft)).to.deep.equal(config);
    });

    it('reads a field that is not a number as NaN, so the configuration\'s problems name it', () => {
        const draft = MockDraft.of(MockConfig.defaults());
        const config = MockDraft.toConfig({ ...draft, gempbaPort: '', counts: { ...draft.counts, ranksPerNode: 'four' } });
        expect(MockConfig.problems(config)).to.include.members([
            'The gempba port must be a whole number from 1 to 65535.',
            'Ranks per node must be a whole number from 1 to 256.'
        ]);
    });
});

describe('MockStatus', () => {

    const config = MockConfig.defaults();

    it('sums up a running mock: where it listens, its cluster and its clients', () => {
        expect(MockStatus.summary({ running: true, ended: false, config, clients: 1, ranks: 4, warnings: [] }))
            .to.equal('Running · Local on 127.0.0.1:9000 · 1 node, 4 ranks · 1 client');
        const jump = { ...config, access: { ...config.access, mode: ConnectionMode.JUMP } };
        expect(MockStatus.summary({ running: true, ended: false, config: jump, clients: 0, ranks: 9, warnings: [] }))
            .to.equal('Running · Jump, SSH on 127.0.0.1:2222 · 2 nodes, 9 ranks · 0 clients');
    });

    it('tells a stopped mock from one whose run ended', () => {
        expect(MockStatus.summary(MockStatus.stopped())).to.equal('Stopped');
        expect(MockStatus.summary({ ...MockStatus.stopped(), ended: true })).to.equal('Ended: gempba\'s process exited');
    });
});
