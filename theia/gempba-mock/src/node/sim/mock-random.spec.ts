import { expect } from 'chai';
import { MockRandom } from './mock-random';

describe('MockRandom', () => {

    function draws(random: MockRandom, count: number): number[] {
        return Array.from({ length: count }, () => random.next());
    }

    function mean(values: readonly number[]): number {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    it('replays the same sequence from the same seed, and another from another seed', () => {
        expect(draws(new MockRandom(42), 5)).to.deep.equal(draws(new MockRandom(42), 5));
        expect(draws(new MockRandom(42), 5)).not.to.deep.equal(draws(new MockRandom(43), 5));
    });

    it('draws uniformly in [0, 1), and whole numbers including both ends', () => {
        const random = new MockRandom(1);
        const values = draws(random, 10_000);
        expect(Math.min(...values)).to.be.at.least(0);
        expect(Math.max(...values)).to.be.below(1);
        expect(mean(values)).to.be.closeTo(0.5, 0.02);
        const ints = new Set(Array.from({ length: 1000 }, () => random.int(1, 3)));
        expect([...ints].sort()).to.deep.equal([1, 2, 3]);
    });

    it('samples distinct items, at most as many as there are', () => {
        const random = new MockRandom(2);
        const picked = random.sample([1, 2, 3, 4, 5, 6], 4);
        expect(new Set(picked).size).to.equal(4);
        expect(random.sample([1, 2], 5).sort()).to.deep.equal([1, 2]);
    });

    it('counts Poisson events with the expected mean, small or large', () => {
        const random = new MockRandom(3);
        expect(random.poisson(0)).to.equal(0);
        expect(mean(Array.from({ length: 10_000 }, () => random.poisson(3)))).to.be.closeTo(3, 0.1);
        expect(mean(Array.from({ length: 10_000 }, () => random.poisson(400)))).to.be.closeTo(400, 1);
        expect(mean(Array.from({ length: 10_000 }, () => random.poisson(0.05)))).to.be.closeTo(0.05, 0.01);
    });

    it('draws log-normal sizes with the asked mean, all positive', () => {
        const random = new MockRandom(5);
        const sizes = Array.from({ length: 20_000 }, () => random.lognormal(1000, 1));
        expect(Math.min(...sizes)).to.be.above(0);
        expect(mean(sizes)).to.be.closeTo(1000, 50);
    });

    it('rounds stochastically, keeping the average', () => {
        const random = new MockRandom(4);
        const rounded = Array.from({ length: 10_000 }, () => random.round(3.4));
        expect(new Set(rounded)).to.deep.equal(new Set([3, 4]));
        expect(mean(rounded)).to.be.closeTo(3.4, 0.02);
    });
});
