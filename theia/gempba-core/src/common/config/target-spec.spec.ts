import { expect } from 'chai';
import { TargetSpec } from './target-spec';

describe('TargetSpec', () => {

    it('a missing target host is normalized to blank', () => {
        const spec = TargetSpec.of(undefined, 9000);
        expect(spec.targetHost).to.equal('');
        expect(TargetSpec.hasTargetHost(spec)).to.be.false;
        expect(spec.gempbaPort).to.equal(9000);
    });

    it('a blank target host is no target', () => {
        expect(TargetSpec.hasTargetHost(TargetSpec.of('   ', 9000))).to.be.false;
    });

    it('a named target host is recognized', () => {
        const spec = TargetSpec.of('me@node01', 9100);
        expect(TargetSpec.hasTargetHost(spec)).to.be.true;
        expect(spec.targetHost).to.equal('me@node01');
    });
});
