import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { NodeLink } from './node-link';

/** What Theia's text editor answers for any URI; a node link must never reach it. */
const THEIA_EDITOR_PRIORITY = 100;

describe('NodeLink', () => {

    it('links to a node and back, whatever its host name holds', () => {
        for (const host of ['alpha', '(unknown host)', 'user@fc30352', 'node-1.cluster.local']) {
            const link = NodeLink.of(host);
            expect(link.scheme).to.equal('gempba-node');
            expect(NodeLink.hostOf(new URI(link.toString())), host).to.equal(host);
        }
    });

    it('points at no node for any other URI', () => {
        for (const other of ['file:///alpha', 'gempba-node:', 'http://alpha/']) {
            expect(NodeLink.hostOf(new URI(other)), other).to.equal(undefined);
        }
    });

    it('lets an opener claim node links only, at its own priority', () => {
        expect(NodeLink.priority(NodeLink.of('alpha'), NodeLink.VIEW_PRIORITY)).to.equal(NodeLink.VIEW_PRIORITY);
        for (const other of ['file:///alpha', 'gempba-node:', 'http://alpha/']) {
            expect(NodeLink.priority(new URI(other), NodeLink.VIEW_PRIORITY), other).to.equal(0);
        }
    });

    it('ranks views above the do-nothing fallback, and both above Theia\'s text editor', () => {
        expect(NodeLink.FALLBACK_PRIORITY).to.be.greaterThan(THEIA_EDITOR_PRIORITY);
        expect(NodeLink.VIEW_PRIORITY).to.be.greaterThan(NodeLink.FALLBACK_PRIORITY);
    });
});
