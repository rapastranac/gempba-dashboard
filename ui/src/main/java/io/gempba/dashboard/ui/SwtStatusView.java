package io.gempba.dashboard.ui;

import io.gempba.dashboard.view.StatusView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Label;

/**
 * The status banner: a single line of connection status text. The SWT
 * implementation of {@link StatusView}. {@link #control()} returns the control
 * to place in the status row.
 */
public final class SwtStatusView implements StatusView {

    private final Label label;

    public SwtStatusView(Composite parent) {
        label = new Label(parent, SWT.NONE);
    }

    /**
     * The control to place in a layout.
     */
    public Control control() {
        return label;
    }

    @Override
    public void setStatus(String text) {
        if (!label.isDisposed()) {
            label.setText(text);
        }
    }
}
