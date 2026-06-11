package io.gempba.dashboard.app;

import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.widgets.Display;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * Loads the application window icon in its several sizes from the classpath
 * ({@code /icons/dashboard-<size>.png}). SWT picks the best-matching size per
 * use (title bar, taskbar, alt-tab), so we hand it the whole set via
 * {@code Shell.setImages}.
 * <p>
 * The PNGs are rasterised from {@code branding/favicon.svg} (this SWT build has
 * no SVG support) by {@code branding/make-icons.py}.
 * <p>
 * The returned {@link Image}s are owned by the caller and must be disposed when
 * the application exits (they're shared across all shells until then).
 */
final class AppIcons {

    private static final int[] SIZES = {16, 32, 48, 64, 128, 256};

    private AppIcons() {
    }

    /**
     * Load every icon size; silently skips any that's missing or unreadable.
     */
    static Image[] load(Display display) {
        List<Image> images = new ArrayList<>();
        for (int size : SIZES) {
            String path = "/icons/dashboard-" + size + ".png";
            try (InputStream in = AppIcons.class.getResourceAsStream(path)) {
                if (in != null) {
                    images.add(new Image(display, in));
                }
            } catch (Exception ignored) {
                // A missing/corrupt icon must never stop the app from starting.
            }
        }
        return images.toArray(new Image[0]);
    }
}
