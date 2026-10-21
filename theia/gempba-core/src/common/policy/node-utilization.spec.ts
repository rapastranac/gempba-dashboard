import { expect } from 'chai';
import { NodeUtilization } from './node-utilization';

describe('NodeUtilization', () => {

    it('four cores pegged over a four-core allocation is 100', () => {
        expect(NodeUtilization.pct(400, 4)).to.be.closeTo(100, 1e-9);
    });

    it('ten cores busy over a twenty-core allocation is 50', () => {
        expect(NodeUtilization.pct(1000, 20)).to.be.closeTo(50, 1e-9);
    });

    it('an idle allocation is zero', () => {
        expect(NodeUtilization.pct(0, 4)).to.equal(0);
    });

    it('oversubscription clamps to 100', () => {
        expect(NodeUtilization.pct(500, 4)).to.equal(100);
    });

    it('no allocation is zero, not infinity', () => {
        expect(NodeUtilization.pct(400, 0)).to.equal(0);
        expect(NodeUtilization.pct(400, -1)).to.equal(0);
    });

    it('negative cpu is floored to zero', () => {
        expect(NodeUtilization.pct(-5, 4)).to.equal(0);
    });
});
