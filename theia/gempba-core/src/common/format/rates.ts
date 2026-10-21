import { NumberText } from './number-text';

export namespace Rates {

    /** A cumulative counter with its run average, e.g. `12,450 total · (3.5 / sec)`; just the total before any time elapsed. */
    export function countWithRate(count: number, elapsedSeconds: number): string {
        if (elapsedSeconds <= 0) {
            return `${NumberText.grouped(count)} total`;
        }
        return `${NumberText.grouped(count)} total · (${perSecond(count / elapsedSeconds)})`;
    }

    /** Adaptive precision: `0.42 / sec`, `3.5 / sec`, `42 / sec`, `1,234 / sec`. */
    export function perSecond(rate: number): string {
        if (Number.isNaN(rate)) {
            return '— / sec';
        }
        if (rate >= 1000) {
            return `${NumberText.grouped(rate)} / sec`;
        }
        if (rate >= 10) {
            return `${NumberText.fixed(rate, 0)} / sec`;
        }
        if (rate >= 1) {
            return `${NumberText.fixed(rate, 1)} / sec`;
        }
        if (rate <= 0) {
            return '0 / sec';
        }
        return `${NumberText.fixed(rate, 2)} / sec`;
    }
}
