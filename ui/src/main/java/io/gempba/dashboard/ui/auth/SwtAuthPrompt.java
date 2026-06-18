package io.gempba.dashboard.ui.auth;

import io.gempba.dashboard.auth.AuthPrompt;
import org.eclipse.swt.SWT;
import org.eclipse.swt.SWTException;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.*;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * SWT implementation of the {@link AuthPrompt} port — the in-app face of MFA.
 * Each method is invoked from the tunnel-opener thread; it schedules a modal
 * dialog on the UI thread and blocks the opener until the user answers — an
 * interactive passcode or host-key prompt raised mid-connect.
 * <p>
 * The blocking is one-directional: the opener thread parks on a
 * {@link CountDownLatch} while the UI thread runs the dialog's own event loop, so
 * SWT never freezes and the two threads never wait on each other in a cycle. If
 * the app is shutting down (display/parent disposed) the dialog is skipped and
 * the call resolves to its "cancelled" value, releasing the opener.
 */
public final class SwtAuthPrompt implements AuthPrompt {

    private final Display display;
    private final Shell parent;

    public SwtAuthPrompt(Display display, Shell parent) {
        this.display = display;
        this.parent = parent;
    }

    @Override
    public List<String> keyboardInteractive(String name, String instruction, List<Field> fields) {
        if (fields.isEmpty()) {
            return List.of(); // zero-field informational round; nothing to ask
        }
        return promptOnUi(null, () -> showFields(title(name, "Two-factor authentication"), instruction, fields));
    }

    @Override
    public String passphrase(String keyPath) {
        List<String> answer = promptOnUi(null, () -> showFields(
                "Key passphrase",
                "Enter the passphrase for the private key:\n" + keyPath,
                List.of(new Field("Passphrase:", false))));
        return (answer == null || answer.isEmpty()) ? null : answer.get(0);
    }

    @Override
    public Decision confirmHostKey(String host, String keyType, String fingerprintSha256) {
        boolean trusted = promptOnUi(Boolean.FALSE, () -> showConfirm(
                "Unknown host",
                "The authenticity of host '" + host + "' can't be established.\n\n"
                        + keyType + " key fingerprint:\n" + fingerprintSha256 + "\n\n"
                        + "Trust this host and continue connecting?",
                "Trust and connect"));
        return trusted ? Decision.ACCEPT : Decision.REJECT;
    }

    // ─── UI-thread handoff ───────────────────────────────────────────────────

    /**
     * Run {@code dialog} on the UI thread and block the caller until it returns,
     * without ever blocking the UI thread. Resolves to {@code cancelled} if the
     * UI is gone or the dialog fails.
     */
    private <T> T promptOnUi(T cancelled, Supplier<T> dialog) {
        if (display.isDisposed()) {
            return cancelled;
        }
        AtomicReference<T> holder = new AtomicReference<>(cancelled);
        CountDownLatch done = new CountDownLatch(1);
        try {
            display.asyncExec(() -> {
                try {
                    if (!display.isDisposed() && !parent.isDisposed()) {
                        holder.set(dialog.get());
                    }
                } catch (RuntimeException dialogFailed) {
                    // leave the cancelled value in place
                } finally {
                    done.countDown();
                }
            });
        } catch (SWTException displayGone) {
            return cancelled;
        }
        try {
            done.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return cancelled;
        }
        return holder.get();
    }

    // ─── dialogs (run on the UI thread) ──────────────────────────────────────

    private List<String> showFields(String title, String instruction, List<Field> fields) {
        Shell dialog = new Shell(parent, SWT.DIALOG_TRIM | SWT.APPLICATION_MODAL);
        dialog.setText(title);
        dialog.setImages(parent.getImages());
        GridLayout layout = new GridLayout(2, false);
        layout.marginWidth = 18;
        layout.marginHeight = 16;
        layout.horizontalSpacing = 10;
        layout.verticalSpacing = 8;
        dialog.setLayout(layout);

        if (instruction != null && !instruction.isBlank()) {
            Label info = new Label(dialog, SWT.WRAP);
            info.setText(instruction);
            GridData gd = new GridData(SWT.FILL, SWT.TOP, true, false, 2, 1);
            gd.widthHint = 360;
            info.setLayoutData(gd);
        }

        List<Text> inputs = new ArrayList<>(fields.size());
        for (Field field : fields) {
            Label label = new Label(dialog, SWT.NONE);
            label.setText(field.label());
            label.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, false, false));
            int style = SWT.BORDER | (field.echo() ? SWT.NONE : SWT.PASSWORD);
            Text input = new Text(dialog, style);
            GridData gd = new GridData(SWT.FILL, SWT.CENTER, true, false);
            gd.widthHint = 240;
            input.setLayoutData(gd);
            inputs.add(input);
        }

        AtomicReference<List<String>> result = new AtomicReference<>(null);
        Button ok = addButtonBar(dialog, "OK", () -> {
            List<String> answers = new ArrayList<>(inputs.size());
            for (Text input : inputs) {
                answers.add(input.getText());
            }
            result.set(answers);
            dialog.close();
        });

        if (!inputs.isEmpty()) {
            inputs.get(0).setFocus();
        }
        runModal(dialog, ok);
        return result.get();
    }

    private boolean showConfirm(String title, String message, String acceptLabel) {
        Shell dialog = new Shell(parent, SWT.DIALOG_TRIM | SWT.APPLICATION_MODAL);
        dialog.setText(title);
        dialog.setImages(parent.getImages());
        GridLayout layout = new GridLayout(1, false);
        layout.marginWidth = 18;
        layout.marginHeight = 16;
        layout.verticalSpacing = 10;
        dialog.setLayout(layout);

        Label info = new Label(dialog, SWT.WRAP);
        info.setText(message);
        GridData gd = new GridData(SWT.FILL, SWT.TOP, true, false);
        gd.widthHint = 400;
        info.setLayoutData(gd);

        AtomicReference<Boolean> result = new AtomicReference<>(Boolean.FALSE);
        Button accept = addButtonBar(dialog, acceptLabel, () -> {
            result.set(Boolean.TRUE);
            dialog.close();
        });

        runModal(dialog, accept);
        return result.get();
    }

    /**
     * A trailing right-aligned button bar with a Cancel and a primary action.
     * Returns the primary button so the caller can make it the default.
     */
    private Button addButtonBar(Shell dialog, String acceptLabel, Runnable onAccept) {
        Composite bar = new Composite(dialog, SWT.NONE);
        GridData barGd = new GridData(SWT.RIGHT, SWT.CENTER, true, false);
        barGd.horizontalSpan = ((GridLayout) dialog.getLayout()).numColumns;
        barGd.verticalIndent = 6;
        bar.setLayoutData(barGd);
        GridLayout barLayout = new GridLayout(2, true);
        barLayout.marginWidth = 0;
        barLayout.marginHeight = 0;
        barLayout.horizontalSpacing = 8;
        bar.setLayout(barLayout);

        Button cancel = new Button(bar, SWT.PUSH);
        cancel.setText("Cancel");
        cancel.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, false, false));
        cancel.addListener(SWT.Selection, e -> dialog.close());

        Button accept = new Button(bar, SWT.PUSH);
        accept.setText(acceptLabel);
        accept.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, false, false));
        accept.addListener(SWT.Selection, e -> onAccept.run());
        return accept;
    }

    private void runModal(Shell dialog, Button defaultButton) {
        dialog.addListener(SWT.Traverse, e -> {
            if (e.detail == SWT.TRAVERSE_ESCAPE) {
                dialog.close();
            }
        });
        if (defaultButton != null) {
            dialog.setDefaultButton(defaultButton);
        }
        dialog.pack();
        centerOnParent(dialog);
        dialog.open();
        while (!dialog.isDisposed()) {
            if (!display.readAndDispatch()) {
                display.sleep();
            }
        }
    }

    private void centerOnParent(Shell dialog) {
        var p = parent.getBounds();
        var d = dialog.getSize();
        dialog.setLocation(p.x + (p.width - d.x) / 2, p.y + (p.height - d.y) / 2);
    }

    private static String title(String supplied, String fallback) {
        return (supplied == null || supplied.isBlank()) ? fallback : supplied;
    }
}
