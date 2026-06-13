package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Durations;
import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.PeerSnapshot;
import io.gempba.dashboard.model.StructureKey;
import io.gempba.dashboard.model.WorldSnapshot;
import org.eclipse.swt.SWT;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.widgets.Composite;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.function.BiConsumer;

/**
 * Top-level card spanning the whole run. Maintains the World → Node → Socket →
 * Worker hierarchy by reconciling its node cards against a {@link WorldSnapshot}
 * read-model — the protocol→domain mapping happens upstream in the
 * {@code WorldSnapshotMapper}, so this card (and everything under it) is free of
 * wire types.
 */
public final class WorldCard extends Card {

    private static final DateTimeFormatter TIME =
            DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.systemDefault());

    private final Map<String, NodeCard> nodesByHost = new LinkedHashMap<>();

    // The structural signature of the previous frame. A frame whose structure
    // matches the last one made no structural change — no cards were added or
    // removed — so the expensive scroll-content relayout can be skipped. The
    // signature is computed once by the mapper and rides on the model.
    private StructureKey lastStructure = StructureKey.empty();

    // Whether node cards created here may be collapsed. False in the
    // single-node detail popup, where collapsing the lone card would just
    // leave an empty panel.
    private boolean nodeCardsCollapsible = true;

    // Optional peer-action override threaded down to every worker card.
    private BiConsumer<Long, List<PeerSnapshot>> onShowPeers;

    public WorldCard(Composite parent) {
        super(parent, CardStyle.world(), "World");
        setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        // Card's default layout uses verticalSpacing = 4, which is right for
        // dense rows (worker labels, socket → worker stacks). At the world
        // level the children are full-width Node cards, and a tighter gap
        // makes them visually run together. Override just for this layer.
        if (getLayout() instanceof org.eclipse.swt.layout.GridLayout l) {
            l.verticalSpacing = 14;
        }
    }

    /**
     * Chromeless variant: drops the outer "World" card border/header so the
     * reused hierarchy renders as just its node card(s). Used by the
     * single-node detail popup, where the World wrapper would be redundant.
     */
    public WorldCard(Composite parent, boolean chromeless) {
        this(parent);
        if (chromeless) {
            setChromeless();
            // The detail popup holds a single node card; collapsing it would
            // only leave empty space, so keep it permanently expanded.
            nodeCardsCollapsible = false;
        }
    }

    /**
     * Set the peer-action handler for every worker card in the hierarchy
     * (existing and future). See {@link WorkerCard#setOnShowPeers}.
     */
    public void setOnShowPeers(BiConsumer<Long, List<PeerSnapshot>> handler) {
        this.onShowPeers = handler;
        for (NodeCard n : nodesByHost.values()) {
            n.setOnShowPeers(handler);
        }
    }

    /**
     * Apply the latest read-model to the card hierarchy.
     *
     * @return {@code true} when the set of nodes/sockets/workers changed this
     * frame (a card was created or removed), meaning the caller should
     * re-measure the scrolled content. {@code false} when only live
     * counters moved — the layout is unchanged and an expensive
     * relayout can be skipped.
     */
    public boolean render(WorldSnapshot model) {
        if (model == null) {
            return false;
        }

        Set<String> present = new HashSet<>();
        for (NodeSnapshot n : model.nodes()) {
            present.add(n.host());
        }

        // Prune nodes whose host vanished entirely this frame.
        var iter = nodesByHost.entrySet().iterator();
        while (iter.hasNext()) {
            var e = iter.next();
            if (!present.contains(e.getKey())) {
                e.getValue().dispose();
                iter.remove();
            }
        }

        for (NodeSnapshot n : model.nodes()) {
            NodeCard node = nodesByHost.get(n.host());
            if (node == null) {
                node = new NodeCard(this, n.host());
                if (onShowPeers != null) {
                    node.setOnShowPeers(onShowPeers);
                }
                nodesByHost.put(n.host(), node);
                if (!nodeCardsCollapsible) {
                    // Detail popup: lone card stays expanded, no chevron.
                    node.setCollapsible(false);
                }
                // Default-collapse policy: only the first node on a run starts
                // expanded; subsequent ones come in collapsed.
                // setCollapsedInitial avoids an O(n²) layout cascade while
                // building a large hierarchy (one layout at the end).
                if (nodeCardsCollapsible && nodesByHost.size() > 1) {
                    node.setCollapsedInitial(true);
                }
            }
            node.render(n);
        }

        setHeader("World",
                String.format("running for %s · schema v%d · last frame at %s · %d %s, %d %s",
                        Durations.formatSeconds(model.elapsedSeconds()),
                        model.schemaVersion(),
                        TIME.format(Instant.ofEpochMilli(model.timestampMillis())),
                        model.totalNodes(), model.totalNodes() == 1 ? "node" : "nodes",
                        model.totalWorkers(), model.totalWorkers() == 1 ? "worker" : "workers"));

        boolean structureChanged = !model.structure().equals(lastStructure);
        lastStructure = model.structure();
        return structureChanged;
    }

    public void clearAll() {
        for (NodeCard n : nodesByHost.values()) {
            n.dispose();
        }
        nodesByHost.clear();
        lastStructure = StructureKey.empty();
    }
}
