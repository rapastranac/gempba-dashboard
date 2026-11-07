import { Emitter } from '@theia/core/lib/common/event';
import { PreferenceSchema } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import { PreferenceService } from '@theia/core/lib/common/preferences/preference-service';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChartCatalog } from '../common/chart-catalog';

export namespace ChartPreferences {

    export const RANK = 'gempba.cards.rankCharts';
    export const NODE = 'gempba.cards.nodeCharts';

    export function of(kind: ChartCatalog.Kind): string {
        return kind === 'rank' ? RANK : NODE;
    }

    const TILES = 'cpu, memory, idle (ranks only), or a count as a rate or so far, such as tasks-started:rate or bytes-sent:total; '
        + 'the counts are tasks-started, tasks-local, tasks-sent, tasks-received, bytes-sent and bytes-received.';

    export const SCHEMA: PreferenceSchema = {
        properties: {
            [RANK]: {
                type: 'array', items: { type: 'string' }, default: ChartCatalog.DEFAULTS.rank.map(ChartCatalog.key),
                description: `The charts of a rank's panel in Cards, in order, three to a row; every rank shows the same. Each is ${TILES}`
            },
            [NODE]: {
                type: 'array', items: { type: 'string' }, default: ChartCatalog.DEFAULTS.node.map(ChartCatalog.key),
                description: `The charts of a node's panel in Cards, in order, three to a row; every node shows the same. Each is ${TILES}`
            }
        }
    };
}

/**
 * The chart layout of every rank's panel and of every node's, kept as the user's settings: they survive a restart, apply
 * in every window, and show on the Settings page. A saved tile the catalog doesn't know is left out.
 */
@injectable()
export class ChartLayouts {

    @inject(PreferenceService) protected readonly preferences: PreferenceService;

    protected readonly onChangeEmitter = new Emitter<ChartCatalog.Kind>();
    /** A layout changed, in any window or on the Settings page. */
    readonly onChange = this.onChangeEmitter.event;

    @postConstruct()
    protected init(): void {
        this.preferences.onPreferenceChanged(change => {
            const kind = (['rank', 'node'] as const).find(each => ChartPreferences.of(each) === change.preferenceName);
            if (kind) {
                this.onChangeEmitter.fire(kind);
            }
        });
    }

    get(kind: ChartCatalog.Kind): ChartCatalog.Tile[] {
        return ChartCatalog.read(kind, this.preferences.get(ChartPreferences.of(kind)));
    }

    set(kind: ChartCatalog.Kind, tiles: readonly ChartCatalog.Tile[]): Promise<void> {
        return this.preferences.set(ChartPreferences.of(kind), tiles.map(ChartCatalog.key), PreferenceScope.User);
    }

    /** Back to the catalog's default layout: the setting is cleared. */
    reset(kind: ChartCatalog.Kind): Promise<void> {
        return this.preferences.set(ChartPreferences.of(kind), undefined, PreferenceScope.User);
    }
}
