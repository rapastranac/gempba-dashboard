/** A seeded random source (mulberry32), so a mocked run replays exactly from its seed. */
export class MockRandom {

    protected state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    /** Uniform in [0, 1). */
    next(): number {
        this.state = (this.state + 0x6D2B79F5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** Uniform in [min, max). */
    between(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    /** A whole number from min to max, both included. */
    int(min: number, max: number): number {
        return min + Math.floor(this.next() * (max - min + 1));
    }

    chance(probability: number): boolean {
        return this.next() < probability;
    }

    pick<T>(items: readonly T[]): T {
        return items[Math.floor(this.next() * items.length)];
    }

    /** Up to `count` distinct items, in random order. */
    sample<T>(items: readonly T[], count: number): T[] {
        const pool = [...items];
        const taken = Math.min(count, pool.length);
        for (let i = 0; i < taken; i++) {
            const j = i + Math.floor(this.next() * (pool.length - i));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, taken);
    }

    /** A standard normal draw (Box-Muller). */
    normal(): number {
        const u = 1 - this.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next());
    }

    /** A positive draw with the given mean, skewed to the right as sizes in a search tree are; `spread` is its log's deviation. */
    lognormal(mean: number, spread: number): number {
        return Math.exp(Math.log(mean) - spread * spread / 2 + spread * this.normal());
    }

    /** How many events happen in an interval that expects `mean` of them: exact below 30, a normal approximation above. */
    poisson(mean: number): number {
        if (!(mean > 0)) {
            return 0;
        }
        if (mean >= 30) {
            return Math.max(0, Math.round(mean + Math.sqrt(mean) * this.normal()));
        }
        const limit = Math.exp(-mean);
        let count = -1;
        let product = 1;
        do {
            count++;
            product *= this.next();
        } while (product > limit);
        return count;
    }

    /** Rounds up with the probability of the fraction: 3.4 gives 4 four times in ten, so averages stay exact. */
    round(value: number): number {
        const whole = Math.floor(value);
        return whole + (this.chance(value - whole) ? 1 : 0);
    }
}
