/**
 * One `host|socket|rank` key per rank in a frame. Two frames with equal keys added or removed
 * no cards, so a relayout can be skipped. Kept as a sorted array so it survives JSON-RPC.
 */
export interface StructureKey {
    readonly keys: readonly string[];
}

export namespace StructureKey {

    export function of(keys: Iterable<string>): StructureKey {
        return { keys: [...new Set(keys)].sort() };
    }

    export function empty(): StructureKey {
        return { keys: [] };
    }

    export function keyOf(host: string, socketId: number, rank: number): string {
        return `${host}|${socketId}|${rank}`;
    }

    export function equals(a: StructureKey, b: StructureKey): boolean {
        return a.keys.length === b.keys.length && a.keys.every((key, index) => key === b.keys[index]);
    }
}
