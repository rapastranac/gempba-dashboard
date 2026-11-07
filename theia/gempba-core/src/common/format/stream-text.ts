import { StreamCondition } from '../policy/stream-condition';
import { ClockText } from './clock-text';

/** The words the views and the status bar use for the data the hub holds. */
export namespace StreamText {

    /** What a view's bar offers: resume or snapshot a paused run, listen again, connect again, or clear frozen data. */
    export type Action = 'resume' | 'snapshot' | 'listen' | 'connect' | 'clear';

    /** The bar's colour, one of the liveness colours: paused, run ended, waiting (reconnecting), or not streaming. */
    export type Tone = 'paused' | 'ended' | 'stale' | 'off';

    export interface Bar {
        readonly tone: Tone;
        readonly text: string;
        readonly actions: readonly Action[];
    }

    const CAUSES: Partial<Record<StreamCondition, string>> = { stopped: 'stopped', disconnected: 'disconnected', lost: 'connection lost' };

    /**
     * The bar across a view's top while its data isn't live: `Paused · last frame 12 s ago`, `Reconnecting… · last frame 12 s ago`,
     * `Run ended · last frame 2 min ago (12:04:31) · waiting for the next run`, or `Not live · last frame 2 min ago (12:04:31) · stopped`;
     * `undefined` while live or holding nothing. Once an SSH session is lost it offers Connect… rather than Listen again…, since
     * only a new session reaches the cluster: listening without one streams this machine.
     */
    export function bar(condition: StreamCondition | undefined, lastFrameAt: number | undefined, now: number): Bar | undefined {
        const age = lastFrameAt === undefined ? undefined : `last frame ${ClockText.ago(now - lastFrameAt)}`;
        const dated = lastFrameAt === undefined ? undefined : `${age} (${ClockText.time(lastFrameAt)})`;
        const join = (...parts: (string | undefined)[]) => parts.filter(part => part !== undefined).join(' · ');
        switch (condition) {
            case undefined:
            case 'live':
                return undefined;
            case 'paused':
                return { tone: 'paused', text: join('Paused', age), actions: ['resume', 'snapshot'] };
            case 'reconnecting':
                return { tone: 'stale', text: join('Reconnecting…', age), actions: [] };
            case 'ended':
                return { tone: 'ended', text: join('Run ended', dated, 'waiting for the next run'), actions: ['clear'] };
            default:
                return { tone: 'off', text: join('Not live', dated, CAUSES[condition]), actions: [condition === 'lost' ? 'connect' : 'listen', 'clear'] };
        }
    }

    /** The words on an action's button. */
    export function actionLabel(action: Action): string {
        return { resume: 'Resume', snapshot: 'Snapshot', listen: 'Listen again…', connect: 'Connect…', clear: 'Clear' }[action];
    }
}
