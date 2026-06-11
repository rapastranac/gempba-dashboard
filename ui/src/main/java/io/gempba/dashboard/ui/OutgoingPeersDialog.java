package io.gempba.dashboard.ui;

import io.gempba.dashboard.format.Bytes;
import io.gempba.dashboard.model.PeerSnapshot;
import org.eclipse.swt.SWT;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.*;

import java.util.List;

/**
 * Modal snapshot of one worker's outgoing peers, opened from the "View all…"
 * button on a {@link WorkerCard}. The card itself can only afford to show a
 * truncated summary (typically 4 entries before the line wraps), but a real
 * dashboard run can have dozens of peers per worker — this dialog shows the
 * full list in a scrollable table.
 * <p>
 * Snapshot semantics: the data shown is whatever the worker frame held when
 * the dialog opened. Live frames continue to flow into the WorkerCard behind
 * it; users who want fresh numbers close the dialog and reopen it. This
 * matches the user's framing of the dialog as "purely informative" without
 * the complexity of subscribing the dialog to the telemetry stream.
 */
public final class OutgoingPeersDialog {

    private final Shell parent;
    private final long workerId;
    private final List<PeerSnapshot> edges;

    public OutgoingPeersDialog(Shell parent, long workerId, List<PeerSnapshot> edges) {
        this.parent = parent;
        this.workerId = workerId;
        this.edges = edges;
    }

    public void open() {
        Shell shell = new Shell(parent, SWT.DIALOG_TRIM | SWT.APPLICATION_MODAL | SWT.RESIZE);
        shell.setText("Outgoing peers — Worker " + workerId);
        shell.setImages(parent.getImages()); // inherit the app icon

        GridLayout layout = new GridLayout(1, false);
        layout.marginWidth = 10;
        layout.marginHeight = 10;
        layout.verticalSpacing = 8;
        shell.setLayout(layout);

        Table table = new Table(shell, SWT.BORDER | SWT.FULL_SELECTION | SWT.V_SCROLL);
        GridData tableGd = new GridData(SWT.FILL, SWT.FILL, true, true);
        tableGd.heightHint = 320;
        tableGd.widthHint = 460;
        table.setLayoutData(tableGd);
        table.setHeaderVisible(true);
        table.setLinesVisible(true);

        TableColumn peerCol = new TableColumn(table, SWT.LEFT);
        peerCol.setText("Peer");
        peerCol.setWidth(140);

        TableColumn tasksCol = new TableColumn(table, SWT.RIGHT);
        tasksCol.setText("Tasks sent");
        tasksCol.setWidth(140);

        TableColumn bytesCol = new TableColumn(table, SWT.RIGHT);
        bytesCol.setText("Bytes");
        bytesCol.setWidth(140);

        long totalBytes = 0;
        long totalTasks = 0;
        if (edges != null) {
            for (PeerSnapshot e : edges) {
                TableItem item = new TableItem(table, SWT.NONE);
                item.setText(0, "Worker " + e.peerWorkerId());
                item.setText(1, String.format("%,d", e.count()));
                item.setText(2, Bytes.human(e.bytes()));
                totalBytes += e.bytes();
                totalTasks += e.count();
            }
        }

        Label totals = new Label(shell, SWT.NONE);
        totals.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        int peerCount = (edges == null) ? 0 : edges.size();
        totals.setText(String.format(
                "Total: %d peer%s · %,d task%s · %s",
                peerCount, peerCount == 1 ? "" : "s",
                totalTasks, totalTasks == 1 ? "" : "s",
                Bytes.human(totalBytes)));

        Composite buttons = new Composite(shell, SWT.NONE);
        buttons.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, true, false));
        GridLayout buttonsLayout = new GridLayout(1, false);
        buttonsLayout.marginWidth = 0;
        buttonsLayout.marginHeight = 0;
        buttons.setLayout(buttonsLayout);

        Button ok = new Button(buttons, SWT.PUSH);
        ok.setText("OK");
        GridData okGd = new GridData(SWT.RIGHT, SWT.CENTER, false, false);
        okGd.widthHint = 90;
        ok.setLayoutData(okGd);
        ok.addListener(SWT.Selection, e -> shell.close());

        Dialogs.closeOnEscape(shell);

        shell.setDefaultButton(ok);
        shell.pack();
        Dialogs.centerOnParent(parent, shell);
        shell.open();

        Display display = parent.getDisplay();
        while (!shell.isDisposed()) {
            if (!display.readAndDispatch()) {
                display.sleep();
            }
        }
    }
}
