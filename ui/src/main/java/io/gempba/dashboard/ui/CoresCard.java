package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Cpu;
import io.gempba.dashboard.model.CoreUsageSnapshot;
import io.gempba.dashboard.model.SocketSnapshot;
import org.eclipse.swt.SWT;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Label;

import java.util.*;

/**
 * Card showing CPU-core context within one socket — the socket's logical
 * core count and, per worker bound to it, how many of those cores the worker
 * can actually use plus how many it's effectively keeping busy.
 * <p>
 * The {@code allowed_cpu_ids ∩ socket cpu_ids} join that produces the
 * per-worker accessible-core count is resolved upstream in the
 * {@code WorldSnapshotMapper}; this card receives the finished
 * {@link CoreUsageSnapshot} rows on its {@link SocketSnapshot} and only formats them.
 */
public final class CoresCard extends Card {

    private final Composite body;

    private final Map<Long, Label> rowsByWorkerId = new LinkedHashMap<>();

    // Latest socket snapshot, cached so the card can re-render when it
    // becomes visible again (it skips rendering while its socket is collapsed).
    private SocketSnapshot lastSocket;

    public CoresCard(Composite parent) {
        super(parent, CardStyle.socket(), "Cores");
        setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));

        body = new Composite(this, SWT.DOUBLE_BUFFERED);
        body.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));
        GridLayout grid = new GridLayout(1, false);
        grid.marginWidth = 0;
        grid.marginHeight = 0;
        grid.verticalSpacing = 2;
        body.setLayout(grid);
    }

    /**
     * Refresh the card with the latest cores information for this socket.
     * Skips rendering while hidden (socket collapsed); {@link #refreshFromCache}
     * re-renders the rows when the socket is expanded.
     */
    public void render(SocketSnapshot socket) {
        lastSocket = socket;
        if (isVisible()) {
            renderFromCache();
        }
    }

    @Override
    protected void refreshFromCache() {
        if (isVisible()) {
            renderFromCache();
        }
    }

    private void renderFromCache() {
        SocketSnapshot socket = lastSocket;
        if (socket == null || socket.logicalCores() <= 0) {
            return;
        }

        setHeader("Cores", String.format("%d logical core%s in this socket",
                socket.logicalCores(), socket.logicalCores() == 1 ? "" : "s"));

        List<CoreUsageSnapshot> usage = socket.coreUsage();

        // Track whether the set of rows changed this tick. Row *text* updates
        // never change the layout (single-line labels, fixed height), so the
        // body only needs a relayout when a worker row is added or removed.
        boolean rowsChanged = false;

        Set<Long> present = new HashSet<>();
        for (CoreUsageSnapshot cu : usage) {
            present.add(cu.workerId());
        }

        // Reconcile rows: keep workers that still appear, drop the rest.
        for (var iter = rowsByWorkerId.entrySet().iterator(); iter.hasNext(); ) {
            var entry = iter.next();
            if (!present.contains(entry.getKey())) {
                entry.getValue().dispose();
                iter.remove();
                rowsChanged = true;
            }
        }

        for (CoreUsageSnapshot cu : usage) {
            Label row = rowsByWorkerId.get(cu.workerId());
            if (row == null) {
                row = new Label(body, SWT.NONE);
                row.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
                rowsByWorkerId.put(cu.workerId(), row);
                rowsChanged = true;
            }
            setTextIfChanged(row, Cpu.coreRow(cu.workerId(), cu.cpuPct(), cu.accessibleCores(), cu.socketCores()));
        }

        if (rowsChanged) {
            body.layout(true, true);
        }
    }
}
