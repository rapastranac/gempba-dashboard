package io.gempba.dashboard.model;

import java.util.Set;

/**
 * The structural signature of a {@link WorldSnapshot}: one {@code host|socket|worker}
 * key per worker present in the frame. Two frames with equal structure keys
 * added or removed no cards, so the expensive scrolled-content relayout can be
 * skipped — the elision check becomes {@code model.structure().equals(prev)},
 * computed once by the mapper instead of re-derived per view.
 *
 * @param keys the set of structural keys (defensively copied, never null)
 */
public record StructureKey(Set<String> keys) {
    public StructureKey {
        keys = (keys == null) ? Set.of() : Set.copyOf(keys);
    }

    /**
     * The empty structure — no nodes, sockets, or workers.
     */
    public static StructureKey empty() {
        return new StructureKey(Set.of());
    }
}
