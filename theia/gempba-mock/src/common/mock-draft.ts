import { ConnectionMode } from '@gempba/core';
import { MockConfig, MockKeySource, MockLive, MockScheduler, MockShape } from './mock-config';

/** The Mock panel's form: numbers as typed, so a half-typed field stays as it is until Start checks it. */
export interface MockDraft {
    readonly mode: ConnectionMode;
    readonly gempbaPort: string;
    readonly sshPort: string;
    readonly keySource: MockKeySource;
    readonly mfa: boolean;
    readonly mfaCode: string;
    readonly counts: { readonly [K in MockShape.Count]: string };
    readonly smt: boolean;
    readonly scheduler: MockScheduler;
    readonly seed: string;
    readonly live: MockLive;
}

export namespace MockDraft {

    export function of(config: MockConfig): MockDraft {
        const { access, shape } = config;
        const counts = Object.fromEntries((Object.keys(MockConfig.SHAPE_BOUNDS) as MockShape.Count[]).map(key => [key, String(shape[key])])) as MockDraft['counts'];
        return {
            mode: access.mode, gempbaPort: String(access.gempbaPort), sshPort: String(access.sshPort), keySource: access.keySource, mfa: access.mfa,
            mfaCode: access.mfaCode, counts, smt: shape.smt, scheduler: config.scheduler, seed: String(config.seed), live: config.live
        };
    }

    /** The configuration the form describes; a field that is not a number reads as NaN, which MockConfig.problems names. */
    export function toConfig(draft: MockDraft): MockConfig {
        const shape = Object.fromEntries((Object.keys(draft.counts) as MockShape.Count[]).map(key => [key, number(draft.counts[key])])) as Omit<MockShape, 'smt'>;
        return {
            access: {
                mode: draft.mode, gempbaPort: number(draft.gempbaPort), sshPort: number(draft.sshPort), keySource: draft.keySource, mfa: draft.mfa,
                mfaCode: draft.mfaCode
            },
            shape: { ...shape, smt: draft.smt },
            scheduler: draft.scheduler,
            live: draft.live,
            seed: number(draft.seed)
        };
    }

    function number(text: string): number {
        return text.trim() === '' ? NaN : Number(text);
    }
}
