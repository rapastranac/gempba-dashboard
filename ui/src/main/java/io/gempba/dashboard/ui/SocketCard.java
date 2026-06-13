package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Cpu;
import io.gempba.dashboard.model.PeerSnapshot;
import io.gempba.dashboard.model.SocketSnapshot;
import io.gempba.dashboard.model.WorkerSnapshot;
import org.eclipse.swt.SWT;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.widgets.Composite;

import java.util.*;
import java.util.function.BiConsumer;

/**
 * Card representing one CPU socket on a node — the (≈ NUMA domain in
 * practice) layer between Node and Worker per the locked lingo. Workers
 * whose primary_socket maps to this id are stacked inside; a child
 * {@link CoresCard} sits at the top showing how each worker uses the
 * socket's cores.
 * <p>
 * Renders from a {@link SocketSnapshot} read-model: it reconciles its worker
 * cards against {@link SocketSnapshot#workers()} and hands the same view to the
 * cores card.
 */
public final class SocketCard extends Card {

    private final int socketId;
    private final Map<Long, WorkerCard> workersById = new LinkedHashMap<>();

    // Eagerly created so the Cores card always sits above the worker cards;
    // it stays empty until a socket view with topology supplies core rows.
    private final CoresCard coresCard;

    private SocketSnapshot lastView;

    // Threaded down to each worker card so an embedder can intercept the
    // "View all…" peers action; null leaves the cards' built-in dialog.
    private BiConsumer<Long, List<PeerSnapshot>> onShowPeers;

    public SocketCard(Composite parent, int socketId) {
        super(parent, CardStyle.socket(), "Socket " + socketId);
        this.socketId = socketId;
        setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        coresCard = new CoresCard(this);
        setCollapsible(true);
    }

    public int socketId() {
        return socketId;
    }

    /**
     * Set the peer-action handler for this socket's worker cards (existing and
     * future). See {@link WorkerCard#setOnShowPeers}.
     */
    public void setOnShowPeers(BiConsumer<Long, List<PeerSnapshot>> handler) {
        this.onShowPeers = handler;
        for (WorkerCard w : workersById.values()) {
            w.setOnShowPeers(handler);
        }
    }

    /**
     * Apply the latest socket read-model: header, worker cards, cores card.
     */
    public void render(SocketSnapshot s) {
        lastView = s;
        renderHeader();

        Set<Long> present = new HashSet<>();
        for (WorkerSnapshot w : s.workers()) {
            present.add(w.workerId());
        }

        // Prune workers that disappeared this tick.
        var iter = workersById.entrySet().iterator();
        while (iter.hasNext()) {
            var e = iter.next();
            if (!present.contains(e.getKey())) {
                e.getValue().dispose();
                iter.remove();
            }
        }

        // Upsert in frame order; new cards inherit the collapse policy.
        for (WorkerSnapshot w : s.workers()) {
            WorkerCard card = workersById.get(w.workerId());
            if (card == null) {
                card = new WorkerCard(this, w.workerId());
                if (onShowPeers != null) {
                    card.setOnShowPeers(onShowPeers);
                }
                workersById.put(w.workerId(), card);
                // Default-collapse policy: a worker only starts expanded when it
                // is the sentinel AND its parent socket is itself expanded. Any
                // worker living under a collapsed socket inherits the collapse so
                // the user does not see scattered expanded sentinels in
                // collapsed branches when they later drill in.
                if (this.isCollapsed() || !w.sentinel()) {
                    card.setCollapsedInitial(true);
                }
                // If we are collapsed the worker card itself must also be hidden
                // inside our body — otherwise the user sees worker strips poking
                // out from a "collapsed" socket header until they manually toggle.
                hideIfCollapsed(card);
            }
            card.render(w);
        }

        coresCard.render(s);
    }

    private void renderHeader() {
        SocketSnapshot s = lastView;
        int workerCount = (s != null) ? s.workerCount() : workersById.size();

        if (s == null || !s.hasTopology()) {
            setHeader("Socket " + socketId,
                    workerCount == 1 ? "1 worker" : workerCount + " workers");
            return;
        }

        String title = (s.name() == null || s.name().isEmpty())
                ? "Socket " + socketId
                : "Socket " + socketId + ": " + s.name();

        StringBuilder subtitle = new StringBuilder();
        if (s.physicalCores() > 0) {
            subtitle.append(s.physicalCores()).append(" physical / ");
        }
        subtitle.append(s.logicalCores()).append(" logical core")
                .append(s.logicalCores() == 1 ? "" : "s");

        String cpuRange = Cpu.range(s.cpuIds());
        if (!cpuRange.isEmpty()) {
            subtitle.append(" (").append(cpuRange).append(")");
        }
        subtitle.append(" · ");
        subtitle.append(workerCount == 1 ? "1 worker" : workerCount + " workers");

        setHeader(title, subtitle.toString());
    }
}
