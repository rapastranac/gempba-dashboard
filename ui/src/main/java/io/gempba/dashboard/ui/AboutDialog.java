package io.gempba.dashboard.ui;

import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Color;
import org.eclipse.swt.graphics.Font;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.program.Program;
import org.eclipse.swt.widgets.*;

import java.io.InputStream;

/**
 * The Help → About window: the app icon, a one-line tagline, the version, and
 * clickable links to the source. Modal with its own event loop (the main window
 * keeps rendering behind it, since the loop pumps the shared event queue).
 */
public final class AboutDialog {

    private static final String DASHBOARD_URL = "https://github.com/rapastranac/gempba-dashboard";
    private static final String GEMPBA_URL = "https://github.com/rapastranac/gempba";

    private AboutDialog() {
    }

    public static void show(Shell parent) {
        Display display = parent.getDisplay();
        Shell shell = new Shell(parent, SWT.DIALOG_TRIM | SWT.APPLICATION_MODAL);
        shell.setText("About GemPBA Dashboard");
        shell.setImages(parent.getImages());

        GridLayout layout = new GridLayout(2, false);
        layout.marginWidth = 20;
        layout.marginHeight = 18;
        layout.horizontalSpacing = 16;
        layout.verticalSpacing = 4;
        shell.setLayout(layout);

        // Icon, spanning the text rows on the left.
        Image icon = loadIcon(display);
        Label iconLabel = new Label(shell, SWT.NONE);
        GridData iconGd = new GridData(SWT.CENTER, SWT.TOP, false, false);
        iconGd.verticalSpan = 4;
        iconLabel.setLayoutData(iconGd);
        if (icon != null) {
            iconLabel.setImage(icon);
        }

        Label title = new Label(shell, SWT.NONE);
        title.setText("GemPBA Dashboard");
        title.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, true, false));
        Font titleFont = Fonts.bold(title.getFont(), 6);
        title.setFont(titleFont);

        Label version = new Label(shell, SWT.NONE);
        version.setText("version " + version());
        version.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, true, false));
        Color muted = new Color(110, 120, 135);
        version.setForeground(muted);

        Label tagline = new Label(shell, SWT.WRAP);
        GridData tagGd = new GridData(SWT.FILL, SWT.TOP, true, false);
        tagGd.widthHint = 380;
        tagGd.verticalIndent = 10;
        tagline.setLayoutData(tagGd);
        tagline.setText("Live, at-a-glance telemetry for the GemPBA parallel "
                + "branch-and-bound framework — nodes, sockets, workers, and how "
                + "hard your allocation is really working.");

        Link links = new Link(shell, SWT.NONE);
        GridData linkGd = new GridData(SWT.FILL, SWT.TOP, true, false);
        linkGd.verticalIndent = 12;
        links.setLayoutData(linkGd);
        links.setText(
                "Dashboard:  <a href=\"" + DASHBOARD_URL + "\">github.com/rapastranac/gempba-dashboard</a>\n"
                        + "GemPBA:  <a href=\"" + GEMPBA_URL + "\">github.com/rapastranac/gempba</a>");
        links.addListener(SWT.Selection, e -> {
            if (e.text != null && !e.text.isBlank()) {
                Program.launch(e.text);
            }
        });

        Label note = new Label(shell, SWT.NONE);
        note.setText("Early and evolving — issues and ideas are welcome.");
        GridData noteGd = new GridData(SWT.LEFT, SWT.CENTER, true, false);
        noteGd.horizontalSpan = 2;
        noteGd.verticalIndent = 14;
        note.setLayoutData(noteGd);
        note.setForeground(muted);

        Button ok = new Button(shell, SWT.PUSH);
        ok.setText("OK");
        GridData okGd = new GridData(SWT.RIGHT, SWT.CENTER, false, false);
        okGd.horizontalSpan = 2;
        okGd.verticalIndent = 6;
        okGd.widthHint = 90;
        ok.setLayoutData(okGd);
        ok.addListener(SWT.Selection, e -> shell.close());

        Dialogs.closeOnEscape(shell);
        shell.addDisposeListener(e -> {
            if (icon != null && !icon.isDisposed()) {
                icon.dispose();
            }
            titleFont.dispose();
        });

        shell.setDefaultButton(ok);
        shell.pack();
        Dialogs.centerOnParent(parent, shell);
        shell.open();
        while (!shell.isDisposed()) {
            if (!display.readAndDispatch()) {
                display.sleep();
            }
        }
    }

    private static String version() {
        String v = AboutDialog.class.getPackage().getImplementationVersion();
        return (v != null && !v.isBlank()) ? v : "dev";
    }

    private static Image loadIcon(Display d) {
        try (InputStream in = AboutDialog.class.getResourceAsStream("/icons/dashboard-64.png")) {
            return (in != null) ? new Image(d, in) : null;
        } catch (Exception e) {
            return null;
        }
    }

}
