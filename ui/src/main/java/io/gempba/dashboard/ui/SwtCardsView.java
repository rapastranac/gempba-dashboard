package io.gempba.dashboard.ui;

import io.gempba.dashboard.model.WorldSnapshot;
import io.gempba.dashboard.view.CardsView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.ScrolledComposite;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.Composite;
import org.eclipse.swt.widgets.Control;

/**
 * The detailed-cards tab: the scroll → content → {@link WorldCard} hierarchy,
 * wrapped as the SWT implementation of {@link CardsView}. Self-contained — it
 * owns the redraw-suppression and scroll re-measurement that used to live in
 * the application's render lambda; {@link #control()} returns the control to
 * host in a tab.
 */
public final class SwtCardsView implements CardsView {

    private final ScrolledComposite scroll;
    private final Composite content;
    private final WorldCard worldCard;

    public SwtCardsView(Composite parent) {
        scroll = new ScrolledComposite(parent, SWT.V_SCROLL);
        scroll.setExpandHorizontal(true);
        scroll.setExpandVertical(true);

        content = new Composite(scroll, SWT.NONE);
        GridLayout layout = new GridLayout(1, false);
        layout.marginWidth = 8;
        layout.marginHeight = 8;
        layout.verticalSpacing = 8;
        content.setLayout(layout);

        worldCard = new WorldCard(content);
        scroll.setContent(content);
        scroll.addListener(SWT.Resize, e -> resync());
    }

    /**
     * The control to host in a tab.
     */
    public Control control() {
        return scroll;
    }

    @Override
    public void render(WorldSnapshot snapshot) {
        if (worldCard.isDisposed() || content.isDisposed()) {
            return;
        }
        content.setRedraw(false);
        try {
            if (worldCard.render(snapshot)) {
                resync();
            }
        } finally {
            content.setRedraw(true);
        }
    }

    @Override
    public void clear() {
        worldCard.clearAll();
        resync();
    }

    private void resync() {
        Scrolling.resync(scroll, content);
    }
}
