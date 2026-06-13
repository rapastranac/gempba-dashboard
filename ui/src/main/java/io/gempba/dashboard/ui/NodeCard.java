package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Bytes;
import io.gempba.dashboard.model.NodeSnapshot;
import io.gempba.dashboard.model.PeerSnapshot;
import io.gempba.dashboard.model.SocketSnapshot;
import org.eclipse.swt.SWT;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.widgets.Composite;

import java.util.*;
import java.util.function.BiConsumer;

/**
 * Card representing one physical machine (node). Owns one {@link SocketCard}
 * per CPU socket detected on this host; the node read-model carries the
 * sockets, each already populated with its workers, so the card just
 * reconciles its socket cards against {@link NodeSnapshot#sockets()}.
 */
public final class NodeCard extends Card {

    private final String hostname;
    // TreeMap so sockets render in numeric order regardless of insertion order.
    private final Map<Integer, SocketCard> socketsBySocketId = new TreeMap<>();

    private NodeSnapshot lastView;

    // Threaded down to each socket (and onward to its worker cards).
    private BiConsumer<Long, List<PeerSnapshot>> onShowPeers;

    public NodeCard(Composite parent, String hostname) {
        super(parent, CardStyle.node(), "Node: " + hostname);
        this.hostname = hostname;
        setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        setCollapsible(true);
    }

    public String hostname() {
        return hostname;
    }

    /**
     * Set the peer-action handler for every socket/worker under this node
     * (existing and future). See {@link WorkerCard#setOnShowPeers}.
     */
    public void setOnShowPeers(BiConsumer<Long, List<PeerSnapshot>> handler) {
        this.onShowPeers = handler;
        for (SocketCard s : socketsBySocketId.values()) {
            s.setOnShowPeers(handler);
        }
    }

    /**
     * Apply the latest node read-model: header plus socket-card reconcile.
     */
    public void render(NodeSnapshot n) {
        lastView = n;
        renderHeader();

        Set<Integer> present = new HashSet<>();
        for (SocketSnapshot s : n.sockets()) {
            present.add(s.socketId());
        }

        // Prune sockets that disappeared this tick.
        var iter = socketsBySocketId.entrySet().iterator();
        while (iter.hasNext()) {
            var e = iter.next();
            if (!present.contains(e.getKey())) {
                e.getValue().dispose();
                iter.remove();
            }
        }

        for (SocketSnapshot s : n.sockets()) {
            SocketCard card = socketsBySocketId.get(s.socketId());
            if (card == null) {
                card = new SocketCard(this, s.socketId());
                if (onShowPeers != null) {
                    card.setOnShowPeers(onShowPeers);
                }
                socketsBySocketId.put(s.socketId(), card);
                // Default-collapse policy: only the first socket on the first
                // (expanded) node is expanded. If this node is itself collapsed,
                // every socket inside it inherits that — so the user only sees a
                // sentinel worker expanded along the chain
                // first-node → first-socket → sentinel.
                if (this.isCollapsed() || socketsBySocketId.size() > 1) {
                    card.setCollapsedInitial(true);
                }
                // If we are collapsed, the new socket card itself must also be
                // hidden inside our body so the user does not see an unexpected
                // strip dangling below our header.
                hideIfCollapsed(card);
            }
            card.render(s);
        }
    }

    /**
     * Build the subtitle from the node read-model. The format is stable:
     * sockets · cores · memory · sentinel. Memory shows "used of total" once a
     * live node frame has arrived ({@link NodeSnapshot#hasLiveMemory()}); until then
     * the topology's total memory is shown if known.
     */
    private void renderHeader() {
        NodeSnapshot n = lastView;
        if (n == null) {
            setHeader("Node: " + hostname, "");
            return;
        }

        StringBuilder subtitle = new StringBuilder();

        int socketCount = n.socketCount();
        subtitle.append(socketCount).append(socketCount == 1 ? " socket" : " sockets");

        subtitle.append(" · ");
        if (n.physicalCores() > 0) {
            subtitle.append(n.physicalCores()).append(" physical / ");
        }
        subtitle.append(n.logicalCores()).append(n.logicalCores() == 1 ? " logical core" : " logical cores");

        if (n.hasLiveMemory()) {
            subtitle.append(" · ").append(Bytes.human(n.memUsedBytes()))
                    .append(" used of ").append(Bytes.human(n.memTotalBytes()));
        } else if (n.memTotalBytes() > 0) {
            // Topology carries memTotal; until the first NodeFrame arrives we
            // can at least show the total so the slot is populated.
            subtitle.append(" · ").append(Bytes.human(n.memTotalBytes()))
                    .append(" total memory");
        }

        subtitle.append(" · sentinel: Worker ").append(n.sentinelWorkerId());

        setHeader("Node: " + hostname, subtitle.toString());
    }
}
