package io.gempba.dashboard.ui;

import io.gempba.dashboard.view.StatusView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.events.PaintEvent;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.GC;
import org.eclipse.swt.graphics.Rectangle;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;
import org.eclipse.swt.widgets.Text;

/**
 * The status banner, rendered as a soft rounded "readout" block with a clipboard
 * {@link CopyIcon} in the corner — so a long error (an ssh failure, say) can be
 * lifted to the clipboard with one click, and is also selectable. The SWT
 * implementation of {@link StatusView}; {@link #control()} returns the block to
 * place in the status row.
 */
public final class SwtStatusView implements StatusView {

    private static final int CORNER_RADIUS = 6;
    // Colors are device-free since SWT 3.115 — no disposal needed.
    private static final Color BLOCK_FILL = new Color(246, 249, 252);
    private static final Color BLOCK_BORDER = new Color(230, 235, 242);

    private final Composite root;
    private final Text text;

    public SwtStatusView(Composite parent) {
        root = new Composite(parent, SWT.DOUBLE_BUFFERED);
        root.setBackground(parent.getBackground());
        GridLayout layout = new GridLayout(2, false);
        layout.marginWidth = 10;
        layout.marginHeight = 5;
        layout.horizontalSpacing = 8;
        root.setLayout(layout);
        root.addPaintListener(this::paintBlock);

        text = new Text(root, SWT.READ_ONLY | SWT.SINGLE);
        text.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        text.setBackground(BLOCK_FILL);

        CopyIcon copy = new CopyIcon(root, this::currentText);
        copy.setBackground(BLOCK_FILL);
        copy.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, false, false));
    }

    /**
     * The control to place in a layout.
     */
    public Control control() {
        return root;
    }

    @Override
    public void setStatus(String value) {
        if (!text.isDisposed()) {
            text.setText(value == null ? "" : value);
        }
    }

    private String currentText() {
        return text.isDisposed() ? "" : text.getText();
    }

    private void paintBlock(PaintEvent e) {
        Rectangle b = root.getClientArea();
        GC gc = e.gc;
        gc.setAdvanced(true);
        gc.setAntialias(SWT.ON);
        gc.setBackground(BLOCK_FILL);
        gc.fillRoundRectangle(0, 0, b.width - 1, b.height - 1, CORNER_RADIUS, CORNER_RADIUS);
        gc.setForeground(BLOCK_BORDER);
        gc.setLineWidth(1);
        gc.drawRoundRectangle(0, 0, b.width - 1, b.height - 1, CORNER_RADIUS, CORNER_RADIUS);
    }
}
