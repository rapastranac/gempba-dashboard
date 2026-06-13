package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Point;
import org.eclipse.swt.graphics.Rectangle;
import org.eclipse.swt.widgets.Shell;

/**
 * Shared shell ergonomics for the app's dialogs and popups.
 */
final class Dialogs {

    private Dialogs() {
    }

    /**
     * Close the shell on ESC. Swing dialogs inherit this from the root pane's
     * default binding; an SWT shell needs the Traverse listener wired
     * explicitly — and the event consumed so it doesn't double as focus
     * traversal.
     */
    static void closeOnEscape(Shell shell) {
        shell.addListener(SWT.Traverse, e -> {
            if (e.detail == SWT.TRAVERSE_ESCAPE) {
                shell.close();
                e.detail = SWT.TRAVERSE_NONE;
                e.doit = false;
            }
        });
    }

    static void centerOnParent(Shell parent, Shell shell) {
        Rectangle pb = parent.getBounds();
        Point size = shell.getSize();
        shell.setLocation(pb.x + (pb.width - size.x) / 2, pb.y + (pb.height - size.y) / 2);
    }
}
