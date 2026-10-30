import { expect } from 'chai';
import { RingSeries } from './ring-series';

function ringOf(capacity: number, ...values: number[]): RingSeries {
    const ring = new RingSeries(capacity);
    values.forEach(value => ring.push(value));
    return ring;
}

describe('RingSeries', () => {

    it('starts empty', () => {
        const ring = new RingSeries(3);
        expect([ring.length, ring.latest(), ring.values()]).to.deep.equal([0, undefined, []]);
    });

    it('keeps every sample, oldest first, until full', () => {
        const ring = ringOf(3, 1, 2);
        expect([ring.length, ring.latest(), ring.values()]).to.deep.equal([2, 2, [1, 2]]);
    });

    it('drops the oldest samples once full', () => {
        const ring = ringOf(3, 1, 2, 3, 4, 5);
        expect([ring.length, ring.latest(), ring.values()]).to.deep.equal([3, 5, [3, 4, 5]]);
    });

    it('wraps around many times', () => {
        const ring = ringOf(4, ...Array.from({ length: 1000 }, (_, i) => i));
        expect(ring.values()).to.deep.equal([996, 997, 998, 999]);
    });

    it('a capacity of one keeps only the newest sample', () => {
        expect(ringOf(1, 7, 8, 9).values()).to.deep.equal([9]);
    });

    it('returns a copy, unaffected by later samples', () => {
        const ring = ringOf(2, 1);
        const values = ring.values();
        ring.push(2);
        ring.push(3);
        expect(values).to.deep.equal([1]);
    });

    it('clear empties it, and it fills again', () => {
        const ring = ringOf(2, 1, 2, 3);
        ring.clear();
        expect([ring.length, ring.latest(), ring.values()]).to.deep.equal([0, undefined, []]);
        ring.push(4);
        expect(ring.values()).to.deep.equal([4]);
    });

    it('rejects a capacity that is not a whole number of at least one', () => {
        for (const capacity of [0, -1, 1.5, Number.NaN]) {
            expect(() => new RingSeries(capacity), `${capacity}`).to.throw(RangeError);
        }
    });
});
