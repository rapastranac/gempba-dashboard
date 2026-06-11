package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.ScrolledComposite;
import org.eclipse.swt.widgets.Composite;

/**
 * The {@link ScrolledComposite} re-measure incantation, shared by every
 * scrolling surface in the app. This is the by-hand version of what
 * {@code JScrollPane} does automatically: a {@code ScrolledComposite} never
 * re-measures its content, so whenever the content's preferred size may have
 * changed its min-size must be recomputed — at the current viewport width, so
 * height-for-width content (wrapping tile rows, collapsible cards) reflows
 * vertically instead of growing a horizontal scrollbar.
 */
final class Scrolling {

    private Scrolling() {
    }

    static void resync(ScrolledComposite scroll, Composite content) {
        if (scroll.isDisposed() || content.isDisposed()) {
            return;
        }
        int width = scroll.getClientArea().width;
        int hint = (width > 0) ? width : SWT.DEFAULT;
        content.layout(true, true);
        scroll.setMinSize(content.computeSize(hint, SWT.DEFAULT));
    }
}
