import { expect } from 'chai';
import { RunControl } from './run-control';

describe('RunControl', () => {

    it('offers Pause while live, Resume while paused, and Snapshot and Mark in either', () => {
        expect(RunControl.offered('live')).to.deep.equal({ pause: true, resume: false, snapshot: true, mark: true });
        expect(RunControl.offered('paused')).to.deep.equal({ pause: false, resume: true, snapshot: true, mark: true });
    });

    it('offers none while the data is frozen or none is held', () => {
        const none = { pause: false, resume: false, snapshot: false, mark: false };
        for (const condition of ['ended', 'reconnecting', 'stopped', 'disconnected', 'lost', undefined] as const) {
            expect(RunControl.offered(condition), String(condition)).to.deep.equal(none);
        }
    });

    it('takes a marker label of 1 to 64 bytes in UTF-8, as gempba keeps it', () => {
        expect(RunControl.labelProblem('phase 2')).to.equal(undefined);
        expect(RunControl.labelProblem('x'.repeat(64))).to.equal(undefined);
        expect(RunControl.labelProblem('')).to.equal('Enter a label');
        expect(RunControl.labelProblem('x'.repeat(65))).to.equal('At most 64 bytes in UTF-8; this label has 65');
        expect(RunControl.labelProblem('é'.repeat(33))).to.equal('At most 64 bytes in UTF-8; this label has 66');
    });

    it('names each control for the status', () => {
        expect([{ kind: 'pause' }, { kind: 'snapshot' }, { kind: 'mark', label: 'phase "2"' }].map(control => RunControl.text(control as RunControl)))
            .to.deep.equal(['pause', 'snapshot', 'mark "phase \\"2\\""']);
    });
});
