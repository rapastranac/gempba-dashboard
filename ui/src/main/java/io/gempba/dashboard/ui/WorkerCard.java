package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Bytes;
import io.gempba.dashboard.format.Durations;
import io.gempba.dashboard.format.Peers;
import io.gempba.dashboard.format.Rates;
import io.gempba.dashboard.model.PeerSnapshot;
import io.gempba.dashboard.model.WorkerSnapshot;
import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.Font;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.layout.RowLayout;
import org.eclipse.swt.widgets.Button;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Label;

import java.util.List;
import java.util.function.BiConsumer;

/**
 * Card displaying a single worker's live counters. The body is split into
 * three sub-sections (Local work / Remote work / Process) so the eye can
 * tell apart what the worker did itself vs. what crossed the wire.
 * <p>
 * The card is collapsible — clicking the header band toggles between a
 * one-line summary (PID · frame · CPU · memory · sentinel) and the full
 * sectioned body.
 * <p>
 * Sentinels (the worker elected per node to emit node-wide telemetry) are
 * marked with a gold border accent and a "★ sentinel" tag in the title.
 * <p>
 * The card renders from a {@link WorkerSnapshot} read-model — no wire types — and
 * exposes a {@link #setOnShowPeers} seam so an embedder can intercept the
 * "View all…" peers action instead of the built-in dialog.
 */
public final class WorkerCard extends Card {

    private final long workerId;

    private final Composite body;

    // local work
    private final Label localTasksValue;
    private final Label tasksRunningValue;

    // remote work
    private final Label sentValue;
    private final Label receivedValue;
    private final Label outgoingPeersValue;
    private final Button outgoingPeersButton;
    private final Label ipcQueueValue;

    // process
    private final Label cpuValue;
    private final Label memoryValue;
    private final Label threadsValue;
    private final Label poolIdleValue;

    private Boolean lastSentinelState;

    // Cache the most recent snapshot so collapse/expand can re-render the
    // header (and body) without waiting for the next frame.
    private WorkerSnapshot lastView;

    // Optional override for the "View all…" peers action. When unset the card
    // opens its own OutgoingPeersDialog — a sensible standalone default.
    private BiConsumer<Long, List<PeerSnapshot>> onShowPeers;

    public WorkerCard(Composite parent, long workerId) {
        super(parent, CardStyle.worker(), "Worker " + workerId);
        this.workerId = workerId;
        setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));

        body = new Composite(this, SWT.DOUBLE_BUFFERED);
        body.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
        GridLayout grid = new GridLayout(2, false);
        grid.marginWidth = 0;
        grid.marginHeight = 0;
        grid.horizontalSpacing = 18;
        grid.verticalSpacing = 4;
        body.setLayout(grid);

        addSectionHeader(body, "Local work");
        localTasksValue = addRow(body, "Tasks completed");
        // tasks_running is a snapshot of currently-executing tasks in this
        // rank's load-balancer thread pool (bounded by pool size). Lives
        // here, not under "Process", because it's about work being done by
        // gempba's worker logic, not OS-level process state.
        tasksRunningValue = addRow(body, "Tasks running");

        addSectionHeader(body, "Remote work");
        receivedValue = addRow(body, "Received from peers");
        sentValue = addRow(body, "Sent to peers");

        // Outgoing peers gets a custom row: a short inline summary (peer
        // count + totals) and a "View all…" button that opens the full table
        // in a modal. The card can comfortably show ~4 entries inline; real
        // runs commonly have many more, and truncation made the rest invisible.
        Label outgoingPeersLabel = new Label(body, SWT.NONE);
        outgoingPeersLabel.setText("Outgoing peers");
        outgoingPeersLabel.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, false, false));

        Composite outgoingPeersCell = new Composite(body, SWT.NONE);
        outgoingPeersCell.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        RowLayout outgoingPeersLayout = new RowLayout(SWT.HORIZONTAL);
        outgoingPeersLayout.marginLeft = 0;
        outgoingPeersLayout.marginRight = 0;
        outgoingPeersLayout.marginTop = 0;
        outgoingPeersLayout.marginBottom = 0;
        outgoingPeersLayout.spacing = 8;
        outgoingPeersLayout.center = true;
        outgoingPeersCell.setLayout(outgoingPeersLayout);

        // Children of a RowLayout-managed composite must use RowData (or
        // null) — leaving GridData here throws a ClassCastException at
        // layout time. Letting RowLayout pick the default sizes is fine:
        // the label hugs its text width, the button hugs its content, and
        // RowLayout's spacing puts them next to each other.
        outgoingPeersValue = new Label(outgoingPeersCell, SWT.NONE);

        outgoingPeersButton = new Button(outgoingPeersCell, SWT.PUSH);
        outgoingPeersButton.setText("View all…");
        outgoingPeersButton.setToolTipText(
                "Open a dialog showing every outgoing peer, the cumulative "
                        + "bytes sent to it, and the task count. Snapshot of "
                        + "the latest frame — close and reopen for fresh "
                        + "numbers.");
        outgoingPeersButton.setEnabled(false);
        outgoingPeersButton.addListener(SWT.Selection, e -> {
            if (lastView == null) {
                return;
            }
            List<PeerSnapshot> peers = lastView.peers();
            if (peers.isEmpty()) {
                return;
            }
            if (onShowPeers != null) {
                onShowPeers.accept(workerId, peers);
            } else {
                new OutgoingPeersDialog(getShell(), workerId, peers).open();
            }
        });

        // scheduler_pending_count is the IPC request queue at the scheduler
        // layer — only IPC-capable schedulers populate it; MT-only runs
        // report 0. Lives under "Remote work" because it's about
        // cross-process traffic, not local pool activity.
        ipcQueueValue = addRow(body, "IPC queue");

        addSectionHeader(body, "Process");
        cpuValue = addRow(body, "CPU");
        memoryValue = addRow(body, "Memory");
        threadsValue = addRow(body, "Threads");
        poolIdleValue = addRow(body, "Pool idle");

        // Card.setCollapsible installs the header click listener and tells
        // the painter to draw a chevron in front of the title.
        setCollapsible(true);
    }

    private static Label addRow(Composite parent, String labelText) {
        Label name = new Label(parent, SWT.NONE);
        name.setText(labelText);
        name.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, false, false));
        Label value = new Label(parent, SWT.NONE);
        value.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        return value;
    }

    private static void addSectionHeader(Composite parent, String text) {
        Label header = new Label(parent, SWT.NONE);
        GridData gd = new GridData(SWT.FILL, SWT.TOP, true, false);
        gd.horizontalSpan = 2;
        gd.verticalIndent = 6;
        header.setLayoutData(gd);
        header.setText(text);

        Font bold = Fonts.bold(header.getFont());
        header.setFont(bold);
        header.setForeground(new Color(70, 90, 120));
        header.addDisposeListener(e -> bold.dispose());
    }

    public long workerId() {
        return workerId;
    }

    /**
     * Override the "View all…" peers action. When set, the button invokes this
     * handler (with the worker id and the latest peer list) instead of opening
     * the built-in {@link OutgoingPeersDialog}. Pass {@code null} to restore the
     * default. This is the widget seam that lets an embedder own peer display.
     */
    public void setOnShowPeers(BiConsumer<Long, List<PeerSnapshot>> handler) {
        this.onShowPeers = handler;
    }

    @Override
    protected void refreshFromCache() {
        if (lastView == null || !isVisible()) {
            return;
        }
        renderHeader();
        if (!isCollapsed()) {
            updateBody();
        }
    }

    public void render(WorkerSnapshot v) {
        boolean sentinel = v.sentinel();
        if (lastSentinelState == null || lastSentinelState != sentinel) {
            setBorderRgb(sentinel ? SENTINEL_BORDER : style().border());
            lastSentinelState = sentinel;
        }

        lastView = v;

        // Don't touch a hidden card (collapsed, or under a collapsed ancestor):
        // nothing is on screen, and the setText churn competes with scrolling.
        // refreshFromCache repaints it the moment it's revealed.
        if (!isVisible()) {
            return;
        }
        renderHeader();
        if (!isCollapsed()) {
            updateBody();
        }
    }

    private void updateBody() {
        WorkerSnapshot v = lastView;
        if (v == null) {
            return;
        }
        long elapsedSeconds = v.elapsedSeconds();
        // setTextIfChanged elides the native repaint when a counter hasn't
        // moved since the last frame.
        setTextIfChanged(localTasksValue, Rates.countWithRate(v.tasksLocalTotal(), elapsedSeconds));
        setTextIfChanged(tasksRunningValue, String.format("%d task%s in pool", v.tasksRunning(), v.tasksRunning() == 1 ? "" : "s"));
        setTextIfChanged(sentValue, Rates.countWithRate(v.tasksSentTotal(), elapsedSeconds));
        setTextIfChanged(receivedValue, Rates.countWithRate(v.tasksRecvTotal(), elapsedSeconds));
        List<PeerSnapshot> peers = v.peers();
        setTextIfChanged(outgoingPeersValue, Peers.summarize(peers));
        boolean hasPeers = !peers.isEmpty();
        if (outgoingPeersButton.getEnabled() != hasPeers) {
            outgoingPeersButton.setEnabled(hasPeers);
        }
        setTextIfChanged(ipcQueueValue, String.format("%d task%s pending", v.schedulerPendingCount(), v.schedulerPendingCount() == 1 ? "" : "s"));

        setTextIfChanged(cpuValue, String.format("%.1f %%", v.cpuPct()));
        setTextIfChanged(memoryValue, Bytes.human(v.rssBytes()));
        setTextIfChanged(threadsValue, Integer.toString(v.threads()));
        setTextIfChanged(poolIdleValue, String.format("%s (cumulative average per pool worker)", Durations.format(v.idleMicrosPerWorker())));
    }

    private void renderHeader() {
        WorkerSnapshot v = lastView;
        // Chevron is rendered by Card itself now, so the title here stays bare.
        String title = "Worker " + workerId + ((v != null && v.sentinel()) ? "  ★ sentinel" : "");

        StringBuilder subtitle = new StringBuilder();
        long pid = (v != null) ? v.pid() : 0;
        if (pid > 0) {
            subtitle.append("PID ").append(pid);
        }
        if (!subtitle.isEmpty()) {
            subtitle.append(" · ");
        }
        subtitle.append("frame #").append(v == null ? 0 : v.seqNo());

        if (isCollapsed() && v != null) {
            // Inline summary so a folded card still tells the user what's
            // happening without expanding it.
            subtitle.append(" · ").append(String.format("%.1f %% CPU", v.cpuPct()));
            subtitle.append(" · ").append(Bytes.human(v.rssBytes()));
        }

        setHeader(title, subtitle.toString());
    }
}
