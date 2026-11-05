import { Emitter, Event } from '@theia/core/lib/common/event';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { RefreshInterval } from '@gempba/core';

export namespace RatePreferences {
    export const INTERVAL = 'gempba.telemetry.workerIntervalMs';

    export const SCHEMA: PreferenceSchema = {
        properties: {
            [INTERVAL]: {
                type: 'integer',
                minimum: RefreshInterval.MIN_MS,
                maximum: RefreshInterval.MAX_MS,
                default: RefreshInterval.DEFAULT_MS,
                description: 'The refresh rate: how often gempba sends every frame, rank and node frames alike, in milliseconds. Applies to every window at once.'
            }
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

    get ready(): Promise<void> {
        return this.preferences.ready;
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
    }

    async set(intervalMs: number): Promise<void> {
        await this.preferences.ready;
        await this.preferences.set(RatePreferences.INTERVAL, RefreshInterval.clamp(intervalMs), PreferenceScope.User);
    }
}
