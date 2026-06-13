package io.gempba.dashboard.ui.settings;

import io.gempba.dashboard.config.Config;
import io.gempba.dashboard.config.ConnectionSpec;
import io.gempba.dashboard.config.RefreshInterval;
import io.gempba.dashboard.ssh.SshCommand;
import io.gempba.dashboard.view.SettingsView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.events.SelectionAdapter;
import org.eclipse.swt.events.SelectionEvent;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.*;

import java.util.List;

/**
 * Self-contained widget tree for the dashboard's settings strip — the band
 * across the top of the shell with port / SSH host / jump host / SSH key /
 * generated ssh command / override toggle / Apply / refresh-rate spinners /
 * Apply rates.
 * <p>
 * The strip owns its own widgets, validation, and internal UI state
 * (override-mode toggling, ssh-command preview rendering, Browse dialog).
 * It does not own the connection lifecycle, the status banner, or anything
 * outside the settings band — those are the surrounding application's job.
 * The strip is the SWT implementation of the {@link SettingsView} view
 * contract: clean specs, validation errors, and rate pushes all flow outward
 * through the {@link SettingsView.Listener} it is given.
 * <p>
 * Threading: all callbacks fire on the SWT UI thread. Listener implementations
 * that hand off to background work are responsible for doing so themselves.
 */
public final class SwtSettingsView implements SettingsView {

    private static final String LOOPBACK = "127.0.0.1";

    private static final String DIRECT_PREVIEW = "(direct TCP — no ssh command; tick Override to enter one manually)";
    private static final String INVALID_PORT_PREVIEW = "(invalid port — fix the Port field above)";

    /**
     * Stand-in used between construction and the host application calling
     * {@link #setListener}. Lets us build the strip in the natural order
     * (widgets first, controllers second) without forward-reference holders
     * — clicks that arrive before a real listener is attached are dropped
     * silently, which is the right thing during a short, intentional
     * wiring window.
     */
    private static final SettingsView.Listener NO_OP_LISTENER = new SettingsView.Listener() {
        @Override
        public void onConnectionApply(ConnectionSpec spec) {
        }

        @Override
        public void onConnectionInvalid(String reason) {
        }

        @Override
        public void onRatesApply(int workerIntervalMs, int nodeIntervalMs) {
        }
    };
    // Connection inputs.
    private final Text portField;
    private final Text sshHostField;
    private final Text jumpHostField;
    private final Text sshKeyField;
    private final Text cmdField;
    private final Button overrideButton;
    // Rate inputs.
    private final Spinner workerRateSpinner;
    private final Spinner nodeRateSpinner;
    private SettingsView.Listener listener = NO_OP_LISTENER;

    public SwtSettingsView(Composite parent, Config initialConfig) {
        Composite settings = new Composite(parent, SWT.BORDER);
        settings.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        GridLayout settingsLayout = new GridLayout(1, false);
        settingsLayout.marginWidth = 8;
        settingsLayout.marginHeight = 6;
        settingsLayout.verticalSpacing = 4;
        settings.setLayout(settingsLayout);

        // Row 1: Port / SSH host. There is no Host field — gempba binds to
        // loopback only, so the dashboard always dials 127.0.0.1 (the local
        // gempba directly, or the local end of the SSH tunnel).
        Composite row1 = horizontalRow(settings, 4);

        new Label(row1, SWT.NONE).setText("Port:");
        portField = new Text(row1, SWT.BORDER);
        GridData portGd = new GridData(SWT.LEFT, SWT.CENTER, false, false);
        portGd.widthHint = 70;
        portField.setLayoutData(portGd);
        portField.setText(String.valueOf(initialConfig.port()));
        portField.setToolTipText(
                "gempba's listening port: what GEMPBA_TELEMETRY_PORT is "
                        + "set to on the running process (default 9000). "
                        + "The dashboard always dials 127.0.0.1 on this "
                        + "port, either locally or through the SSH tunnel.");

        new Label(row1, SWT.NONE).setText("SSH host:");
        sshHostField = new Text(row1, SWT.BORDER);
        sshHostField.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        sshHostField.setMessage("user@vm-ip   (node running GemPBA)");
        sshHostField.setToolTipText(
                "Optional. SSH destination: must include the remote "
                        + "username, e.g. 'user@35.227.142.127'. "
                        + "Without 'user@', ssh defaults to your local "
                        + "Windows username, which usually fails on GCP.\n"
                        + "When set, the dashboard tunnels via 'ssh -N -L' "
                        + "using your system ssh client (~/.ssh/config, "
                        + "ssh-agent, OS Login). Leave blank for direct TCP "
                        + "to a gempba running on this machine.");
        sshHostField.setText(initialConfig.sshHost());

        // Row 2: Jump host / SSH key / Browse
        Composite row2 = horizontalRow(settings, 5);

        new Label(row2, SWT.NONE).setText("Jump host:");
        jumpHostField = new Text(row2, SWT.BORDER);
        jumpHostField.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        jumpHostField.setMessage("user@login.cluster.edu   (HPC: tunnel hops through here)");
        jumpHostField.setToolTipText(
                "Optional. SSH jump host (-J / ProxyJump). Use this for the "
                        + "HPC pattern where you ssh to a login node and then "
                        + "from there to a compute node running gempba: put "
                        + "the login node here and the compute node in 'SSH "
                        + "host'. Leave blank for a single-hop tunnel.");
        jumpHostField.setText(initialConfig.jumpHost());

        new Label(row2, SWT.NONE).setText("SSH key:");
        sshKeyField = new Text(row2, SWT.BORDER);
        sshKeyField.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        sshKeyField.setMessage("(optional: uses system ssh config when blank)");
        sshKeyField.setToolTipText(
                "Optional. Private key file passed to 'ssh -i'. Leave blank "
                        + "to use ssh-agent / ~/.ssh/config / OS Login — fine "
                        + "for GCP where your public key is registered on the "
                        + "VM, and for HPC clusters where your key is "
                        + "registered on the login node. Set this only when "
                        + "you need a specific PEM (typical AWS workflow).\n"
                        + "Stays editable in override mode — the displayed "
                        + "'<ssh-key>' placeholder is substituted at exec time.");
        sshKeyField.setText(initialConfig.sshKey());

        Button browseButton = new Button(row2, SWT.PUSH);
        browseButton.setText("Browse…");

        // Row 3: ssh command preview / override target
        Composite row3 = horizontalRow(settings, 2);

        Label cmdLabel = new Label(row3, SWT.NONE);
        cmdLabel.setText("ssh command:");
        cmdLabel.setLayoutData(new GridData(SWT.LEFT, SWT.TOP, false, false));

        cmdField = new Text(row3, SWT.BORDER | SWT.WRAP | SWT.MULTI);
        GridData cmdGd = new GridData(SWT.FILL, SWT.CENTER, true, false);
        cmdGd.heightHint = 48;
        cmdField.setLayoutData(cmdGd);
        cmdField.setEditable(false);
        cmdField.setToolTipText(
                "The 'ssh' command the dashboard will run when SSH host is "
                        + "set. Read-only until you tick 'Override' below.\n"
                        + "Placeholders: <local-port> is substituted with an "
                        + "auto-picked port at exec time; <ssh-key> is "
                        + "substituted with the SSH key field above. Keep "
                        + "them as-is in override mode unless you have a "
                        + "specific reason to fix the local port (then put "
                        + "a literal number in -L; the dashboard will parse "
                        + "it back).");

        // Row 4: override toggle + Apply
        Composite row4 = horizontalRow(settings, 2);

        overrideButton = new Button(row4, SWT.CHECK);
        overrideButton.setText("Override command line");
        overrideButton.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, true, false));
        overrideButton.setToolTipText(
                "Take manual control of the ssh command above. Use this "
                        + "when your tunnel needs flags the dashboard "
                        + "doesn't expose (e.g. -A for agent forwarding, "
                        + "multiple -L forwards, extra -o options). The "
                        + "Port / SSH host / Jump host fields above are "
                        + "disabled while override is on; SSH key stays "
                        + "active because the command references it via "
                        + "the <ssh-key> placeholder.");

        Button applyButton = new Button(row4, SWT.PUSH);
        applyButton.setText("Apply");

        // Row 5: refresh rates pushed to the running gempba over the same
        // socket. gempba's center clamps incoming values to [50, 600000] ms
        // (parse_control_line / apply_control_from_client), so the spinners
        // mirror that range; we don't pre-clamp client-side, the user sees
        // exactly what they sent.
        Composite row5 = horizontalRow(settings, 5);
        ((GridLayout) row5.getLayout()).horizontalSpacing = 8;

        new Label(row5, SWT.NONE).setText("Worker rate (ms):");
        workerRateSpinner = new Spinner(row5, SWT.BORDER);
        workerRateSpinner.setMinimum(RefreshInterval.MIN_MS);
        workerRateSpinner.setMaximum(RefreshInterval.MAX_MS);
        workerRateSpinner.setIncrement(50);
        workerRateSpinner.setPageIncrement(500);
        workerRateSpinner.setSelection(RefreshInterval.DEFAULT_WORKER_MS);
        workerRateSpinner.setToolTipText(
                "How often each worker emits a frame, in milliseconds. "
                        + "Lower = smoother dashboard but more CPU/network "
                        + "overhead on the worker. Range: "
                        + RefreshInterval.MIN_MS + "–"
                        + RefreshInterval.MAX_MS + " ms (gempba "
                        + "clamps to this range server-side).");

        new Label(row5, SWT.NONE).setText("Node rate (ms):");
        nodeRateSpinner = new Spinner(row5, SWT.BORDER);
        nodeRateSpinner.setMinimum(RefreshInterval.MIN_MS);
        nodeRateSpinner.setMaximum(RefreshInterval.MAX_MS);
        nodeRateSpinner.setIncrement(100);
        nodeRateSpinner.setPageIncrement(1000);
        nodeRateSpinner.setSelection(RefreshInterval.DEFAULT_NODE_MS);
        nodeRateSpinner.setToolTipText(
                "How often the per-node sentinel emits a node frame, in "
                        + "milliseconds. Same range as worker rate. Node "
                        + "telemetry is more expensive (probes the OS for "
                        + "CPU/memory/disk/net), so the default is slower.");

        Button applyRatesButton = new Button(row5, SWT.PUSH);
        applyRatesButton.setText("Apply rates");
        applyRatesButton.setToolTipText(
                "Push the chosen worker and node frame intervals to the "
                        + "running gempba over the existing telemetry "
                        + "connection (no reconnect). Takes effect on "
                        + "gempba's next emission cycle. The dashboard also "
                        + "re-sends these on every (re)connect, so a gempba "
                        + "restart inherits whatever you last set.");

        // ─── interaction wiring ─────────────────────────────────────────────

        // Live-update the preview on any input change (no-op while override
        // is on — the user is editing the command directly).
        portField.addListener(SWT.Modify, e -> updatePreview());
        sshHostField.addListener(SWT.Modify, e -> updatePreview());
        jumpHostField.addListener(SWT.Modify, e -> updatePreview());
        sshKeyField.addListener(SWT.Modify, e -> updatePreview());

        // Toggle override: edit the command directly, lock the template
        // params (sshKey stays free since the command references it via
        // <ssh-key>).
        overrideButton.addListener(SWT.Selection, e -> {
            boolean on = overrideButton.getSelection();
            cmdField.setEditable(on);
            portField.setEnabled(!on);
            sshHostField.setEnabled(!on);
            jumpHostField.setEnabled(!on);
            // Re-sync the preview from inputs when leaving override mode so
            // the user sees what their fields would produce; never auto-clear
            // their custom command on the way in.
            if (!on) {
                updatePreview();
            }
        });

        browseButton.addListener(SWT.Selection, e -> {
            Shell shell = settings.getShell();
            FileDialog dialog = new FileDialog(shell, SWT.OPEN);
            dialog.setText("Select SSH private key");
            dialog.setFilterNames(new String[]{"All files", "PEM keys", "PuTTY keys"});
            dialog.setFilterExtensions(new String[]{"*.*", "*.pem", "*.ppk"});
            String path = dialog.open();
            if (path != null) {
                sshKeyField.setText(path);
            }
        });

        applyButton.addListener(SWT.Selection, e -> fireConnectionApply());

        applyRatesButton.addListener(SWT.Selection, e -> {
            listener.onRatesApply(workerRateSpinner.getSelection(), nodeRateSpinner.getSelection());
        });

        // Pressing Enter in any single-line text field triggers Apply.
        // (cmdField is multi-line — Enter inserts a newline there, which
        // is the right behavior for editing a long command.)
        SelectionAdapter applyOnEnter = new SelectionAdapter() {
            @Override
            public void widgetDefaultSelected(SelectionEvent e) {
                applyButton.notifyListeners(SWT.Selection, new Event());
            }
        };
        portField.addSelectionListener(applyOnEnter);
        sshHostField.addSelectionListener(applyOnEnter);
        jumpHostField.addSelectionListener(applyOnEnter);
        sshKeyField.addSelectionListener(applyOnEnter);

        // Render the initial preview before any user interaction.
        updatePreview();
    }

    private static int parsePortOrSentinel(String s) {
        try {
            int p = Integer.parseInt(s);
            return (p < 1 || p > 65_535) ? -1 : p;
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    // ─── command preview ───────────────────────────────────────────────────

    private static Composite horizontalRow(Composite parent, int columns) {
        Composite row = new Composite(parent, SWT.NONE);
        row.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        GridLayout layout = new GridLayout(columns, false);
        layout.marginWidth = 0;
        layout.marginHeight = 0;
        layout.horizontalSpacing = 6;
        row.setLayout(layout);
        return row;
    }

    /**
     * Attach the listener that receives Apply / Apply-rates events.
     * Designed to be called once after construction, when the host
     * application has finished wiring its other components (so the
     * listener implementation can delegate to them safely). Calling with
     * {@code null} reverts to a no-op listener.
     */
    @Override
    public void setListener(SettingsView.Listener listener) {
        this.listener = (listener != null) ? listener : NO_OP_LISTENER;
    }

    private void updatePreview() {
        if (overrideButton.getSelection()) {
            return;
        }
        int p = parsePortOrSentinel(portField.getText().trim());
        String sshHost = sshHostField.getText().trim();
        String jumpHost = jumpHostField.getText().trim();
        String sshKey = sshKeyField.getText().trim();

        String preview;
        if (sshHost.isBlank()) {
            preview = DIRECT_PREVIEW;
        } else if (p < 0) {
            preview = INVALID_PORT_PREVIEW;
        } else {
            List<String> tpl = SshCommand.buildTemplate(
                    sshHost,
                    LOOPBACK,
                    p,
                    sshKey.isBlank() ? null : sshKey,
                    jumpHost.isBlank() ? null : jumpHost);
            preview = SshCommand.renderTemplate(tpl);
        }
        if (!cmdField.getText().equals(preview)) {
            cmdField.setText(preview);
        }
    }

    private void fireConnectionApply() {
        int port;
        try {
            port = Integer.parseInt(portField.getText().trim());
        } catch (NumberFormatException ex) {
            listener.onConnectionInvalid("invalid port: '" + portField.getText() + "'");
            return;
        }
        if (port < 1 || port > 65_535) {
            listener.onConnectionInvalid("invalid port (must be 1–65535)");
            return;
        }
        ConnectionSpec connectionSpec = new ConnectionSpec(
                port,
                sshHostField.getText().trim(),
                jumpHostField.getText().trim(),
                sshKeyField.getText().trim(),
                overrideButton.getSelection(),
                cmdField.getText());
        listener.onConnectionApply(connectionSpec);
    }
}
