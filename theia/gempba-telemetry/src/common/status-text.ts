import { ClockText, ConnectionState, NumberText, Rates, RefreshInterval, RunSetup, RunSetupText, StreamCondition, TaskWords } from '@gempba/core';
import { ObservedIntervals } from './telemetry-service';

/**
 * The hub's status-bar entry: an icon and a few words for the stream, and on hover what it is doing. Live, it reads
 * `2 nodes · 12.4k tasks/s · 500 ms`; with data held but not live, why, and when the data is from.
 */
export namespace StatusText {

    export interface Stream {
        readonly state: ConnectionState;
        readonly condition: StreamCondition | undefined;
        /** The hub's latest status line. */
        readonly status: string;
        readonly nodes?: number;
        /** Tasks started per second by every rank, the latest sample. */
        readonly throughput?: number;
        readonly intervalMs: number;
        readonly observed: ObservedIntervals;
        readonly run?: RunSetup;
        readonly lastFrameAt?: number;
    }

    export interface Shown {
        readonly text: string;
        readonly tooltip: string;
    }

    const HELD: Record<Exclude<StreamCondition, 'live'>, { readonly icon: string, readonly words: string }> = {
        paused: { icon: 'debug-pause', words: 'paused' },
        ended: { icon: 'pass', words: 'run ended' },
        reconnecting: { icon: 'sync~spin', words: 'reconnecting' },
        stopped: { icon: 'debug-stop', words: 'stopped' },
        disconnected: { icon: 'debug-disconnect', words: 'disconnected' },
        lost: { icon: 'warning', words: 'connection lost' }
    };

    const EMPTY: Record<ConnectionState, { readonly icon: string, readonly words: string }> = {
        [ConnectionState.DISCONNECTED]: { icon: 'debug-disconnect', words: 'disconnected' },
        [ConnectionState.CONNECTING]: { icon: 'sync~spin', words: 'connecting' },
        [ConnectionState.CONNECTED]: { icon: 'plug', words: 'connected' },
        [ConnectionState.LISTENING]: { icon: 'radio-tower', words: 'listening' }
    };

    export function of(stream: Stream): Shown {
        return { text: `$(${icon(stream)}) GemPBA: ${words(stream)}`, tooltip: tooltip(stream).join('\n') };
    }

    /** `12.4k tasks/s` past a thousand a second, `3.5 tasks/s` or `12 tasks/min` below. */
    export function rate(perSecond: number): string {
        return perSecond >= 1000 ? `${NumberText.compact(perSecond)} tasks/s` : Rates.text(perSecond);
    }

    function icon({ state, condition }: Stream): string {
        if (condition === 'live') {
            return 'pulse';
        }
        return condition ? HELD[condition].icon : EMPTY[state].icon;
    }

    function words({ state, condition, nodes, throughput, intervalMs, lastFrameAt }: Stream): string {
        if (condition === 'live') {
            const count = nodes ?? 0;
            return [`${count} ${count === 1 ? 'node' : 'nodes'}`, throughput === undefined ? undefined : rate(throughput), RefreshInterval.label(intervalMs)]
                .filter(part => part !== undefined).join(' · ');
        }
        if (!condition) {
            return EMPTY[state].words;
        }
        return lastFrameAt === undefined ? HELD[condition].words : `${HELD[condition].words} · data from ${ClockText.time(lastFrameAt)}`;
    }

    function tooltip({ state, condition, status, throughput, intervalMs, observed, run }: Stream): string[] {
        const listening = state === ConnectionState.LISTENING;
        const lines = [status || EMPTY[state].words];
        if (condition && run) {
            lines.push(RunSetupText.line(run));
        }
        if (condition === 'live' && throughput !== undefined) {
            lines.push(`${TaskWords.STARTED}: ${Rates.text(throughput)}`);
        }
        const arriving = listening ? ObservedIntervals.text(observed) : '';
        lines.push(`Refresh rate ${RefreshInterval.label(intervalMs)}${arriving ? `; ${arriving}` : ''}`);
        lines.push('Click for the live controls.');
        return lines;
    }
}
