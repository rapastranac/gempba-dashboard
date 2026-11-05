import { ConnectionMode } from '@gempba/core';
import { MockFidelity, MockKeySource, MockScenario, MockScheduler } from './mock-config';

export interface MockChoice<T> {
    readonly value: T;
    readonly label: string;
    readonly detail: string;
}

/** How the mocker's panel and commands name its choices. */
export namespace MockLabels {

    export const MODES: readonly MockChoice<ConnectionMode>[] = [
        { value: ConnectionMode.LOCAL, label: 'Local', detail: 'The mock\'s telemetry listens on a loopback port, as gempba\'s does on this machine' },
        { value: ConnectionMode.HOST, label: 'Host', detail: 'A mock VM over SSH, with gempba running on it' },
        { value: ConnectionMode.JUMP, label: 'Jump host', detail: 'A mock login node over SSH, with gempba on a compute node behind it' }
    ];

    export const SCENARIOS: readonly MockChoice<MockScenario>[] = [
        { value: 'steady', label: 'Steady', detail: 'Fast tasks at the set load' },
        { value: 'slow', label: 'Slow tasks', detail: 'Tasks of about 12 s: a worker finishes one every few seconds' },
        { value: 'ramp', label: 'Ramp up and drain', detail: 'A finite search tree, about 150 s of work for the whole cluster: it spreads, holds, drains, and the run ends' },
        { value: 'imbalanced', label: 'Imbalanced', detail: 'One worker in four keeps what it explores, rarely sending a small subtree; the others mostly wait' },
        { value: 'bursty', label: 'Bursty', detail: 'Busy for 20 s of every 30 s' }
    ];

    export const SCHEDULERS: readonly MockChoice<MockScheduler>[] = [
        { value: 'semi-centralized', label: 'Semi-centralized', detail: 'The coordinator pairs each busy worker with an idle one, which the worker sends one task to' },
        { value: 'centralized', label: 'Centralized', detail: 'Workers send spare tasks to a queue at the coordinator, which hands them to idle workers' }
    ];

    export const FIDELITIES: readonly MockChoice<MockFidelity>[] = [
        { value: 'gempba', label: 'As gempba today', detail: 'Zeros where gempba sends zeros, and its fixed 500 ms broadcast' },
        { value: 'full', label: 'Every field', detail: 'Socket CPU, network and disk filled in, broadcast at the worker rate' }
    ];

    export const KEY_SOURCES: readonly MockChoice<MockKeySource>[] = [
        { value: 'system', label: 'Your keys in ~/.ssh', detail: 'Accepts the public keys in ~/.ssh and its authorized_keys' },
        { value: 'generated', label: 'A generated key', detail: 'Accepts only a key pair the mocker keeps in ~/.gempba-dashboard/mock' }
    ];

    export function of<T>(choices: readonly MockChoice<T>[], value: T): MockChoice<T> {
        return choices.find(choice => choice.value === value) ?? choices[0];
    }
}
