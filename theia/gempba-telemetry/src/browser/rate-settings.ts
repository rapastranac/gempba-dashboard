import { Emitter, Event } from '@theia/core/lib/common/event';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { RefreshInterval, RefreshRates } from '@gempba/core';

export namespace RatePreferences {
    export const WORKER_INTERVAL = 'gempba.telemetry.workerIntervalMs';
    export const NODE_INTERVAL = 'gempba.telemetry.nodeIntervalMs';

    export const SCHEMA: PreferenceSchema = {
        properties: {
            [WORKER_INTERVAL]: {
                type: 'integer',
                minimum: RefreshInterval.MIN_MS,
                maximum: RefreshInterval.MAX_MS,
                default: RefreshInterval.DEFAULT_WORKER_MS,
                description: 'How often each gempba worker sends a frame (CPU, tasks, memory), in milliseconds. Applies to every window at once.'
            },
            [NODE_INTERVAL]: {
                type: 'integer',
                minimum: RefreshInterval.MIN_MS,
                maximum: RefreshInterval.MAX_MS,
                default: RefreshInterval.DEFAULT_NODE_MS,
                description: 'How often each node\'s sentinel sends a node frame (node memory), in milliseconds. Applies to every window at once.'
            }
        }
    };
}

/** The refresh rates kept as the user's settings, which every window shares. */
export const RateSettings = Symbol('RateSettings');

export interface RateSettings {
    readonly ready: Promise<void>;
    /** The rates as set, within gempba's bounds. */
    readonly rates: RefreshRates;
    readonly onChange: Event<RefreshRates>;
    set(rates: Partial<RefreshRates>): Promise<void>;
}

/** The rate settings over Theia's preferences, so they are on the Settings page and saved with the other settings. */
@injectable()
export class PreferenceRateSettings implements RateSettings {

    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    protected readonly onChangeEmitter = new Emitter<RefreshRates>();
    readonly onChange = this.onChangeEmitter.event;

    get ready(): Promise<void> {
        return this.preferences.ready;
    }

    get rates(): RefreshRates {
        return RefreshRates.of({
            workerIntervalMs: this.preferences.get(RatePreferences.WORKER_INTERVAL),
            nodeIntervalMs: this.preferences.get(RatePreferences.NODE_INTERVAL)
        });
    }

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(change => {
            if (change.preferenceName === RatePreferences.WORKER_INTERVAL || change.preferenceName === RatePreferences.NODE_INTERVAL) {
                this.onChangeEmitter.fire(this.rates);
            }
        });
    }

    async set(rates: Partial<RefreshRates>): Promise<void> {
        await this.preferences.ready;
        if (rates.workerIntervalMs !== undefined) {
            await this.preferences.set(RatePreferences.WORKER_INTERVAL, RefreshInterval.clamp(rates.workerIntervalMs), PreferenceScope.User);
        }
        if (rates.nodeIntervalMs !== undefined) {
            await this.preferences.set(RatePreferences.NODE_INTERVAL, RefreshInterval.clamp(rates.nodeIntervalMs), PreferenceScope.User);
        }
    }
}
