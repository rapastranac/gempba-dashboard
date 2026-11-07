import { expect } from 'chai';
import { Cpu } from './cpu';

describe('Cpu', () => {

    it('range collapses contiguous runs', () => {
        expect(Cpu.range([0, 1, 2, 3, 4])).to.equal('CPUs 0–4');
        expect(Cpu.range([0, 2, 4])).to.equal('CPUs 0, 2, 4');
        expect(Cpu.range([0, 1, 2, 5, 6, 7])).to.equal('CPUs 0–2, 5–7');
    });

    it('range of nothing is blank', () => {
        expect(Cpu.range([])).to.equal('');
        expect(Cpu.range(undefined)).to.equal('');
    });

    it('effective cores buckets', () => {
        expect(Cpu.effectiveCores(0, 4)).to.equal('idle');
        expect(Cpu.effectiveCores(0.5, 4)).to.equal('0.50 cores');
        expect(Cpu.effectiveCores(1.2, 4)).to.equal('1.2 core');
        expect(Cpu.effectiveCores(2.1, 4)).to.equal('2.1 cores');
        expect(Cpu.effectiveCores(9.1, 4)).to.equal('9.1 cores (oversubscribed)');
    });

    it('core usage shows access and usage', () => {
        expect(Cpu.coreUsage(87.3, 8, 8)).to.equal('87.3 % CPU · can use all 8 cores · currently using ≈ 0.87 cores');
        expect(Cpu.coreUsage(50, 4, 8)).to.contain('can use 4 of 8 cores');
    });
});
