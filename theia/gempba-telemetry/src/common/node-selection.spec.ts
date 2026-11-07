import { expect } from 'chai';
import { NodeSelection } from './node-selection';

describe('NodeSelection', () => {

    it('recognizes a selected node', () => {
        expect(NodeSelection.is(NodeSelection.of('node07'))).to.equal(true);
    });

    it('rejects any other selection', () => {
        for (const other of [undefined, null, 'node07', { host: 'node07' }, { kind: 'gempba.node' }, { kind: 'file', host: 'node07' }]) {
            expect(NodeSelection.is(other), JSON.stringify(other)).to.equal(false);
        }
    });
});
