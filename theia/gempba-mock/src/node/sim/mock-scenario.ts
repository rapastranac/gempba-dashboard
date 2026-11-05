import { MockScenario } from '../../common/mock-config';

const MiB = 1024 ** 2;

/**
 * How a scenario drives the run: how long tasks take, how big the search tree and the subtrees workers give away are,
 * and how readily they give them. Time is measured from when the scenario started, so switching to one mid-run starts
 * it from its beginning.
 */
export interface MockScenarioModel {
    /** The mean time a task runs. */
    readonly meanTaskMs: number;
    /** The memory one running task holds. */
    readonly taskRssBytes: number;
    /** Whether the search tree is finite: once it is explored the run ends, as gempba's process exits. */
    readonly endsWhenDrained: boolean;
    /** The share of its pool a worker keeps busy, from 0 to 1, before the load setting. */
    loadFactor(timeMs: number): number;
    /** The tasks in the whole tree the center seeds, for a cluster that finishes `tasksPerSecond` together; Infinity for an endless one. */
    seedTasks(tasksPerSecond: number): number;
    /** How long, on average, a branch the worker cuts off an endless root keeps one worker busy. */
    branchSeconds(id: number): number;
    /** The chance, each step, that the worker gives away a task when it has one to spare and somewhere to send it. */
    sendChance(id: number): number;
}

export namespace MockScenarioModel {

    /** Ramp up and drain: a finite tree worth this long of the whole cluster's work. */
    export const RAMP_WORK_SECONDS = 150;

    /** Bursty: busy for 20 s of every 30 s. */
    export const BURST_PERIOD_MS = 30_000;
    export const BURST_BUSY_MS = 20_000;

    /** Imbalanced: one worker in four holds the work, rarely gives any, and then only small subtrees. */
    export function isRich(id: number): boolean {
        return id % 4 === 1;
    }

    export function of(scenario: MockScenario): MockScenarioModel {
        const endless = { endsWhenDrained: false, seedTasks: () => Infinity };
        const sharing = { branchSeconds: () => 120, sendChance: () => 1 };
        switch (scenario) {
            case 'steady':
                return { ...fast(), ...endless, ...sharing, loadFactor: () => 1 };
            case 'slow':
                // tasks of about 12 s: a worker with a pool of four finishes one every few seconds
                return { meanTaskMs: 12_000, taskRssBytes: 32 * MiB, ...endless, branchSeconds: () => 600, sendChance: () => 1, loadFactor: () => 1 };
            case 'ramp':
                return {
                    ...fast(), ...sharing, endsWhenDrained: true, loadFactor: () => 1,
                    seedTasks: tasksPerSecond => tasksPerSecond * RAMP_WORK_SECONDS
                };
            case 'imbalanced':
                return {
                    ...fast(), ...endless, loadFactor: () => 1,
                    branchSeconds: id => isRich(id) ? 0.2 : 120,
                    sendChance: id => isRich(id) ? 0.05 : 1
                };
            case 'bursty':
                return { ...fast(), ...endless, ...sharing, loadFactor: time => time % BURST_PERIOD_MS < BURST_BUSY_MS ? 1 : 0.1 };
        }
    }

    function fast(): Pick<MockScenarioModel, 'meanTaskMs' | 'taskRssBytes'> {
        return { meanTaskMs: 2, taskRssBytes: MiB };
    }
}
