import { NumberText } from './number-text';

/**
 * Rates as they come: per second from one a second up, per minute below that, and never a coarser unit, so a worker
 * that sent a single task reads `0 /min` rather than a per-hour or per-day figure.
 */
export namespace Rates {

    export type Unit = '/s' | '/min';

    export function unitFor(perSecond: number): Unit {
        return perSecond >= 1 ? '/s' : '/min';
    }

    /** The rate counted in the unit. */
    export function inUnit(perSecond: number, unit: Unit): number {
        return unit === '/min' ? perSecond * 60 : perSecond;
    }

    /** A rate's figure and unit, `3.5` and `/s` or `12` and `/min`, in the given unit or its own; `—` and no unit before there is one. */
    export function of(perSecond: number | undefined, unit?: Unit): { readonly value: string, readonly unit?: Unit } {
        if (perSecond === undefined || Number.isNaN(perSecond)) {
            return { value: '—' };
        }
        const shown = unit ?? unitFor(perSecond);
        return { value: figure(inUnit(perSecond, shown)), unit: shown };
    }

    /** `3.5 tasks/s`, `12 tasks/min`, or `—`. */
    export function text(perSecond: number | undefined, noun = 'tasks', unit?: Unit): string {
        const { value, unit: shown } = of(perSecond, unit);
        return shown ? `${value} ${noun}${shown}` : value;
    }

    /** A cumulative counter with its run average, e.g. `12,450 · 3.5 tasks/s on average`; the total alone while it is 0 or no time elapsed. */
    export function countWithRate(count: number, elapsedSeconds: number): string {
        if (count <= 0 || elapsedSeconds <= 0) {
            return NumberText.grouped(count);
        }
        return `${NumberText.grouped(count)} · ${text(count / elapsedSeconds)} on average`;
    }

    /** Adaptive precision: `0.42`, `3.5`, `42`, `1,234`. */
    function figure(value: number): string {
        if (value >= 1000) {
            return NumberText.grouped(value);
        }
        if (value >= 10) {
            return NumberText.fixed(value, 0);
        }
        if (value >= 1) {
            return NumberText.fixed(value, 1);
        }
        return value <= 0 ? '0' : NumberText.fixed(value, 2);
    }
}
