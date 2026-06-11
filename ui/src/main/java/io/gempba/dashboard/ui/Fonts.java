package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Font;
import org.eclipse.swt.graphics.FontData;

/**
 * Font derivation — SWT's equivalent of Swing's {@code font.deriveFont(Font.BOLD)}.
 * SWT fonts are immutable native resources, so deriving means copying the
 * {@link FontData} and allocating a new {@link Font} the caller must dispose.
 */
final class Fonts {

    private Fonts() {
    }

    /**
     * A bold variant of {@code base}. The caller owns (and must dispose) the
     * returned font.
     */
    static Font bold(Font base) {
        return bold(base, 0);
    }

    /**
     * A bold variant of {@code base}, {@code sizeDelta} points larger. The
     * caller owns (and must dispose) the returned font.
     */
    static Font bold(Font base, int sizeDelta) {
        FontData[] data = base.getFontData();
        for (FontData fd : data) {
            fd.setStyle(SWT.BOLD);
            if (sizeDelta != 0) {
                fd.setHeight(fd.getHeight() + sizeDelta);
            }
        }
        return new Font(base.getDevice(), data);
    }
}
