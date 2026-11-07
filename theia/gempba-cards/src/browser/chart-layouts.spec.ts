import '@theia/core/shared/reflect-metadata';
import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { Container } from '@theia/core/shared/inversify';
import { ChartCatalog } from '../common/chart-catalog';
import { ChartLayouts, ChartPreferences } from './chart-layouts';

/** User settings held in memory, as the preference service keeps them: setting `undefined` removes a key. */
class UserPreferences {
    readonly values = new Map<string, unknown>();
    protected readonly onChangeEmitter = new Emitter<{ preferenceName: string }>();
    readonly onPreferenceChanged = this.onChangeEmitter.event;

    get(name: string): unknown {
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

function layoutsOver(preferences: UserPreferences): ChartLayouts {
    const container = new Container();
    container.bind(PreferenceService).toConstantValue(preferences as unknown as PreferenceService);
    container.bind(ChartLayouts).toSelf();
    return container.get(ChartLayouts);
}

describe('ChartLayouts', () => {

    it('shows the catalog\'s defaults while nothing is saved', () => {
        const layouts = layoutsOver(new UserPreferences());
        expect([layouts.get('rank'), layouts.get('node')]).to.deep.equal([ChartCatalog.DEFAULTS.rank, ChartCatalog.DEFAULTS.node]);
    });

    it('restores a saved layout, leaving out a tile it doesn\'t know', () => {
        const preferences = new UserPreferences();
        preferences.values.set(ChartPreferences.RANK, ['bytes-sent:rate', 'gpu', 'idle']);
        expect(layoutsOver(preferences).get('rank')).to.deep.equal([{ id: 'bytes-sent', form: 'rate' }, { id: 'idle' }]);
    });

    it('saves a layout as tile keys in the user\'s settings, and says which kind changed', async () => {
        const preferences = new UserPreferences();
        const layouts = layoutsOver(preferences);
        const changed: ChartCatalog.Kind[] = [];
        layouts.onChange(kind => changed.push(kind));
        await layouts.set('node', [{ id: 'memory' }, { id: 'tasks-local', form: 'rate' }]);
        expect(preferences.values.get(ChartPreferences.NODE)).to.deep.equal(['memory', 'tasks-local:rate']);
        expect([layouts.get('node'), changed]).to.deep.equal([[{ id: 'memory' }, { id: 'tasks-local', form: 'rate' }], ['node']]);
    });

    it('resets a layout to the default by clearing the setting', async () => {
        const preferences = new UserPreferences();
        preferences.values.set(ChartPreferences.RANK, ['memory']);
        const layouts = layoutsOver(preferences);
        await layouts.reset('rank');
        expect([preferences.values.has(ChartPreferences.RANK), layouts.get('rank')]).to.deep.equal([false, ChartCatalog.DEFAULTS.rank]);
    });

    it('defaults to the catalog\'s layouts in the settings schema', () => {
        const properties = ChartPreferences.SCHEMA.properties;
        expect([properties[ChartPreferences.RANK].default, properties[ChartPreferences.NODE].default])
            .to.deep.equal([['cpu', 'tasks-started:total', 'idle'], ['cpu', 'tasks-started:total', 'memory']]);
    });
});
