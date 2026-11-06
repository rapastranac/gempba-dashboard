import { RankCount } from '@gempba/core';

/**
 * The charts a Cards panel can show, those it shows by default, and how a saved layout reads. A rank panel and a node
 * panel each have one layout, shared by every rank or node: a list of tiles, three to a row. A count shows as a rate or as
 * its running total; CPU, memory and idle time are levels and have one form.
 */
export namespace ChartCatalog {

    export type Kind = 'rank' | 'node';

    export type Form = 'rate' | 'total';

    export type Id = 'cpu' | 'memory' | 'idle' | 'tasks-started' | 'tasks-local' | 'tasks-sent' | 'tasks-received' | 'bytes-sent' | 'bytes-received';

    /** One tile: what it charts, and for a count whether as a rate or a running total. */
    export interface Tile {
        readonly id: Id;
        readonly form?: Form;
    }

    const COUNTS: Readonly<Partial<Record<Id, RankCount>>> = {
        'tasks-started': 'tasksStarted', 'tasks-local': 'tasksLocal', 'tasks-sent': 'tasksSent', 'tasks-received': 'tasksReceived',
        'bytes-sent': 'bytesSent', 'bytes-received': 'bytesReceived'
    };

    const LABELS: Readonly<Record<Id, string>> = {
        'cpu': 'CPU', 'memory': 'Memory', 'idle': 'Idle', 'tasks-started': 'Tasks started', 'tasks-local': 'Tasks run locally',
        'tasks-sent': 'Tasks sent', 'tasks-received': 'Tasks received', 'bytes-sent': 'Bytes sent', 'bytes-received': 'Bytes received'
    };

    const COUNT_IDS = Object.keys(COUNTS) as Id[];

    /** The tiles each kind of panel can show, in the order the catalog lists them. */
    export const IDS: Readonly<Record<Kind, readonly Id[]>> = {
        rank: ['cpu', 'memory', 'idle', ...COUNT_IDS],
        node: ['cpu', 'memory', ...COUNT_IDS]
    };

    /** A rank's tasks started read as a running total, since a rank whose work others hold reads a rate of 0 for long stretches. */
    export const DEFAULTS: Readonly<Record<Kind, readonly Tile[]>> = {
        rank: [{ id: 'cpu' }, { id: 'tasks-started', form: 'total' }, { id: 'idle' }],
        node: [{ id: 'cpu' }, { id: 'tasks-started', form: 'total' }, { id: 'memory' }]
    };

    /** The count a tile charts, or `undefined` for a level. */
    export function countOf(id: Id): RankCount | undefined {
        return COUNTS[id];
    }

    export function label(id: Id): string {
        return LABELS[id];
    }

    /** How a tile is saved: `cpu`, or a count with its form, `tasks-started:total`. */
    export function key(tile: Tile): string {
        return countOf(tile.id) ? `${tile.id}:${tile.form ?? 'total'}` : tile.id;
    }

    /**
     * A saved layout of this kind of panel: each key a tile this kind can show, a count without a form as its running total.
     * Unknown keys, a level saved with a form and repeats are left out; anything but a list reads as the default.
     */
    export function read(kind: Kind, saved: unknown): Tile[] {
        if (!Array.isArray(saved)) {
            return [...DEFAULTS[kind]];
        }
        const tiles: Tile[] = [];
        const seen = new Set<string>();
        for (const entry of saved) {
            const tile = typeof entry === 'string' ? parse(kind, entry) : undefined;
            if (tile && !seen.has(key(tile))) {
                seen.add(key(tile));
                tiles.push(tile);
            }
        }
        return tiles;
    }

    /** Whether the layout can take another tile of this id: a level once, a count once as a running total and once as a rate. */
    export function canAdd(tiles: readonly Tile[], id: Id): boolean {
        return added(tiles, id) !== undefined;
    }

    /** The layout with a tile of this id at its end, a count as its running total, or as its rate once its total shows. */
    export function add(tiles: readonly Tile[], id: Id): Tile[] {
        const tile = added(tiles, id);
        return tile ? [...tiles, tile] : [...tiles];
    }

    /** Whether the tile at `index` can become one of this id, a count keeping its form, without repeating a tile shown. */
    export function canSwap(tiles: readonly Tile[], index: number, id: Id): boolean {
        const tile = tiles[index];
        return tile !== undefined && tile.id !== id && !shows(tiles, swapped(tile, id), index);
    }

    export function swap(tiles: readonly Tile[], index: number, id: Id): Tile[] {
        return canSwap(tiles, index, id) ? tiles.map((tile, at) => at === index ? swapped(tile, id) : tile) : [...tiles];
    }

    /** Whether the count at `index` can show in this form, which another tile doesn't show already. */
    export function canShowAs(tiles: readonly Tile[], index: number, form: Form): boolean {
        const tile = tiles[index];
        return tile !== undefined && countOf(tile.id) !== undefined && (tile.form ?? 'total') !== form && !shows(tiles, { id: tile.id, form }, index);
    }

    export function showAs(tiles: readonly Tile[], index: number, form: Form): Tile[] {
        return canShowAs(tiles, index, form) ? tiles.map((tile, at) => at === index ? { id: tile.id, form } : tile) : [...tiles];
    }

    /** The layout with the tile at `from` moved to `to`, the tiles between shifting over. */
    export function move(tiles: readonly Tile[], from: number, to: number): Tile[] {
        if (from === to || tiles[from] === undefined || to < 0 || to >= tiles.length) {
            return [...tiles];
        }
        const moved = [...tiles];
        moved.splice(to, 0, ...moved.splice(from, 1));
        return moved;
    }

    export function remove(tiles: readonly Tile[], index: number): Tile[] {
        return tiles.filter((_, at) => at !== index);
    }

    function added(tiles: readonly Tile[], id: Id): Tile | undefined {
        const forms: (Form | undefined)[] = countOf(id) ? ['total', 'rate'] : [undefined];
        return forms.map((form): Tile => form ? { id, form } : { id }).find(tile => !shows(tiles, tile));
    }

    function swapped(tile: Tile, id: Id): Tile {
        return countOf(id) ? { id, form: tile.form ?? 'total' } : { id };
    }

    /** Whether a tile other than the one at `except` shows this one. */
    function shows(tiles: readonly Tile[], tile: Tile, except = -1): boolean {
        return tiles.some((each, at) => at !== except && key(each) === key(tile));
    }

    function parse(kind: Kind, entry: string): Tile | undefined {
        const [id, form, ...rest] = entry.trim().split(':');
        if (rest.length > 0 || !IDS[kind].includes(id as Id)) {
            return undefined;
        }
        if (!countOf(id as Id)) {
            return form === undefined ? { id: id as Id } : undefined;
        }
        return form === undefined || form === 'total' || form === 'rate' ? { id: id as Id, form: form ?? 'total' } : undefined;
    }
}
