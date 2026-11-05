import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { Container } from '@theia/core/shared/inversify';
import { RefreshInterval } from '@gempba/core';
import { PreferenceRateSettings, RatePreferences } from './rate-settings';

/** User settings held in memory, as the preference service keeps them: setting `undefined` removes a key. */
class UserPreferences {
    readonly values = new Map<string, unknown>();
    readonly ready = Promise.resolve();
    protected readonly onChangeEmitter = new Emitter<{ preferenceName: string }>();
    readonly onPreferenceChanged = this.onChangeEmitter.event;

    get(name: string): unknown {
        return this.values.get(name);
    }

    inspectInScope(name: string): unknown {
        return this.values.get(name);
    }

    async set(name: string, value: unknown): Promise<void> {
        if (value === undefined) {
            this.values.delete(name);
        } else {
            this.values.set(name, value);
        }
        this.onChangeEmitter.fire({ preferenceName: name });
    }
}

function settingsOver(preferences: UserPreferences): PreferenceRateSettings {
    const container = new Container();
    container.bind(PreferenceService).toConstantValue(preferences as unknown as PreferenceService);
    container.bind(PreferenceRateSettings).toSelf();
    return container.get(PreferenceRateSettings);
}

function saved(values: Record<string, number>): UserPreferences {
    const preferences = new UserPreferences();
    Object.entries(values).forEach(([name, value]) => preferences.values.set(name, value));
    return preferences;
}

describe('PreferenceRateSettings', () => {

    it('carries a worker rate saved before the one refresh rate over to it, once, and clears both old rates', async () => {
        const preferences = saved({ [RatePreferences.OLD_WORKER_INTERVAL]: 650, [RatePreferences.OLD_NODE_INTERVAL]: 500 });
        const settings = settingsOver(preferences);
        await settings.ready;
        expect(settings.intervalMs).to.equal(650);
        expect([...preferences.values.keys()]).to.deep.equal([RatePreferences.INTERVAL]);
        const again = settingsOver(preferences);
        await again.ready;
        expect([again.intervalMs, [...preferences.values.entries()]]).to.deep.equal([650, [[RatePreferences.INTERVAL, 650]]]);
    });

    it('keeps a refresh rate already set, and still clears the old rates', async () => {
        const preferences = saved({ [RatePreferences.INTERVAL]: 250, [RatePreferences.OLD_WORKER_INTERVAL]: 650 });
        const settings = settingsOver(preferences);
        await settings.ready;
        expect([settings.intervalMs, [...preferences.values.keys()]]).to.deep.equal([250, [RatePreferences.INTERVAL]]);
    });

    it('brings a hand-edited old rate within gempba\'s bounds, and starts at the default with nothing saved', async () => {
        const settings = settingsOver(saved({ [RatePreferences.OLD_WORKER_INTERVAL]: 10 }));
        await settings.ready;
        expect(settings.intervalMs).to.equal(RefreshInterval.MIN_MS);
        const fresh = settingsOver(saved({}));
        await fresh.ready;
        expect(fresh.intervalMs).to.equal(RefreshInterval.DEFAULT_MS);
    });

    it('saves a new rate within gempba\'s bounds and announces it', async () => {
        const settings = settingsOver(saved({}));
        const announced: number[] = [];
        settings.onChange(intervalMs => announced.push(intervalMs));
        await settings.set(10_000_000);
        expect([settings.intervalMs, announced]).to.deep.equal([RefreshInterval.MAX_MS, [RefreshInterval.MAX_MS]]);
    });
});
