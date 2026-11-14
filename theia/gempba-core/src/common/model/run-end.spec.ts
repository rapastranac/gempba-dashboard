import { expect } from 'chai';
import { RunEnd } from './run-end';

describe('RunEnd', () => {

    it('says a completed run is proven', () => {
        const end: RunEnd = { reason: 'completed' };
        expect([RunEnd.headline(end), RunEnd.result(end)]).to.deep.equal(['Run completed', 'result proven']);
    });

    it('names what interrupted a run, which keeps its best result so far', () => {
        expect(RunEnd.headline({ reason: 'interrupted', trigger: 'signal', signal: 'SIGTERM' })).to.equal('Run interrupted by SIGTERM');
        expect(RunEnd.headline({ reason: 'interrupted', trigger: 'control' })).to.equal('Run stopped from a dashboard');
        expect(RunEnd.headline({ reason: 'interrupted', trigger: 'code' })).to.equal('Run stopped by its program');
        expect(RunEnd.result({ reason: 'interrupted', trigger: 'code' })).to.equal('best result so far');
    });

    it('still reads without a trigger or a signal name', () => {
        expect(RunEnd.headline({ reason: 'interrupted' })).to.equal('Run interrupted');
        expect(RunEnd.headline({ reason: 'interrupted', trigger: 'signal' })).to.equal('Run interrupted by a signal');
    });
});
