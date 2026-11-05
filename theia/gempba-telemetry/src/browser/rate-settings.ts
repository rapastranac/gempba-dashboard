import { Emitter, Event } from '@theia/core/lib/common/event';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { RefreshInterval } from '@gempba/core';

export namespace RatePreferences {
    export const INTERVAL = 'gempba.telemetry.intervalMs';
    /**
     * The worker and node rates saved before one rate drove every frame. They stay in the schema, hidden, so a saved
     * value can be read once, the worker rate carried over to {@link INTERVAL}, and both cleared.
     */
    export const OLD_WORKER_INTERVAL = 'gempba.telemetry.workerIntervalMs';
    export const OLD_NODE_INTERVAL = 'gempba.telemetry.nodeIntervalMs';

    export const SCHEMA: PreferenceSchema = {
        properties: {
            [INTERVAL]: {
                type: 'integer',
                minimum: RefreshInterval.MIN_MS,
                maximum: RefreshInterval.MAX_MS,
                default: RefreshInterval.DEFAULT_MS,
                description: 'The refresh rate: how often gempba sends every frame, rank and node frames alike, in milliseconds. Applies to every window at once.'
            },
            [OLD_WORKER_INTERVAL]: { type: 'integer', hidden: true, description: `Replaced by ${INTERVAL}.` },
            [OLD_NODE_INTERVAL]: { type: 'integer', hidden: true, description: `Replaced by ${INTERVAL}, which drives every frame.` }
        }
    };
}

/** The refresh rate kept as the user's setting, which every window shares. */
export const RateSettings = Symbol('RateSettings');

export interface RateSettings {
    readonly ready: Promise<void>;
    /** The refresh rate as set, in milliseconds, within gempba's bounds. */
    readonly intervalMs: number;
    readonly onChange: Event<number>;
    set(intervalMs: number): Promise<void>;
}

/** The rate setting over Theia's preferences, so it is on the Settings page and saved with the other settings. */
@injectable()
export class PreferenceRateSettings implements RateSettings {

    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    protected readonly onChangeEmitter = new Emitter<number>();
    readonly onChange = this.onChangeEmitter.event;
    protected moving: Promise<void> | undefined;

    /** Resolves once the preferences are read and any rate saved under the old keys has moved. */
    get ready(): Promise<void> {
        this.moving ??= this.preferences.ready.then(() => this.moveOldRates());
        return this.moving;
    }

    get intervalMs(): number {
        const value = this.preferences.get(RatePreferences.INTERVAL);
        return typeof value === 'number' && Number.isFinite(value) ? RefreshInterval.clamp(value) : RefreshInterval.DEFAULT_MS;
    }

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === RatePreferences.INTERVAL) {
                this.onChangeEmitter.fire(this.intervalMs);
            }
        });
        // at startup, so the rate shown is the one saved, whether or not anything streams
        this.ready.catch(() => undefined);
    }

    async set(intervalMs: number): Promise<void> {
        await this.ready;
        await this.preferences.set(RatePreferences.INTERVAL, RefreshInterval.clamp(intervalMs), PreferenceScope.User);
    }

    /**
     * Carries a rate saved under the worker rate's old key over to the refresh rate, unless one is set already, then
     * clears both old keys, as the node rate has no place now. It runs once: nothing is left to move after it. A file
     * that can't be written keeps the old keys for the next start.
     */
    protected async moveOldRates(): Promise<void> {
        const worker = this.preferences.inspectInScope<number>(RatePreferences.OLD_WORKER_INTERVAL, PreferenceScope.User);
        const node = this.preferences.inspectInScope<number>(RatePreferences.OLD_NODE_INTERVAL, PreferenceScope.User);
        if (worker === undefined && node === undefined) {
            return;
        }
        try {
            if (typeof worker === 'number' && Number.isFinite(worker)
                && this.preferences.inspectInScope<number>(RatePreferences.INTERVAL, PreferenceScope.User) === undefined) {
                await this.preferences.set(RatePreferences.INTERVAL, RefreshInterval.clamp(worker), PreferenceScope.User);
            }
            await this.preferences.set(RatePreferences.OLD_WORKER_INTERVAL, undefined, PreferenceScope.User);
            await this.preferences.set(RatePreferences.OLD_NODE_INTERVAL, undefined, PreferenceScope.User);
        } catch {
            return;
        }
    }
}
