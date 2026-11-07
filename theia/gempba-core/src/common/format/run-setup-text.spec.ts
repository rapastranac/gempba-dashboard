import { expect } from 'chai';
import { RunSetup } from '../model/run-setup';
import { RunSetupText } from './run-setup-text';

const RUN: RunSetup = {
    scheduler: 'semi_centralized', loadBalancer: 'quasi_horizontal', runtimeMode: 'multiprocessing', worldSize: 4, threadsPerProcess: 8,
    gempbaVersion: '4.3.0', annotations: [['instance', 'tsp-100'], ['mock', 'seed 42']],
    markers: [{ elapsedMs: 4_000, label: 'phase 2', source: 'dashboard' }, { elapsedMs: 90_500, label: 'bound found', source: 'code' }]
};

describe('RunSetupText', () => {

    it('says the scheduler, load balancer, ranks, threads and gempba version in one line', () => {
        expect(RunSetupText.line(RUN)).to.equal('Semi-centralized · quasi-horizontal · 4 ranks · 8 threads · gempba 4.3.0');
        expect(RunSetupText.line({ ...RUN, scheduler: 'centralized', loadBalancer: 'work_stealing' }))
            .to.equal('Centralized · work stealing · 4 ranks · 8 threads · gempba 4.3.0');
    });

    it('leaves out what the run doesn\'t report, and shows a custom scheduler\'s name as sent', () => {
        expect(RunSetupText.line({ ...RUN, scheduler: undefined, worldSize: 1, threadsPerProcess: 0, gempbaVersion: undefined }))
            .to.equal('Quasi-horizontal · 1 rank');
        expect(RunSetupText.line({ ...RUN, scheduler: 'my_ring' })).to.match(/^My_ring · /);
    });

    it('lists the annotations in the order the program set them, then the markers', () => {
        expect(RunSetupText.details(RUN)).to.deep.equal([
            'instance: tsp-100', 'mock: seed 42', 'phase 2 at 4.0 s, from a dashboard', 'bound found at 1 m 30 s, from the program'
        ]);
        expect(RunSetupText.details({ ...RUN, annotations: [], markers: [] })).to.deep.equal([]);
    });
});
