package io.gempba.dashboard.ui.settings;

import io.gempba.dashboard.config.*;
import io.gempba.dashboard.view.SettingsView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.custom.StackLayout;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.*;

import java.util.ArrayList;
import java.util.List;

/**
 * The connection bar: a mode dropdown (Local / Host / Jump) whose fields split
 * into a <em>connection</em> half (authenticate once — Connect/Disconnect) and a
 * <em>target</em> half (point at a job — a Listen/Stop toggle), so re-pointing
 * never re-authenticates. Per-mode field groups are swapped with a
 * {@link StackLayout}; short lists of recent targets and login hosts are
 * remembered for quick switching.
 * <p>
 * The bar owns its widgets and validation and emits intent through
 * {@link SettingsView.Listener}; the application pushes lifecycle back in via
 * {@link #setConnectionState}, which also flips the Listen/Stop toggle — so when
 * the stream ends (gempba finished) the toggle reverts to "Listen" on its own.
 * All callbacks fire on the UI thread.
 */
public final class SwtSettingsView implements SettingsView {

    private static final int RECENTS_CAP = 10;
    private static final String[] MODE_LABELS = {"Local", "Host", "Jump host"};

    private static final SettingsView.Listener NO_OP = new SettingsView.Listener() {
        @Override
        public void onConnect(SessionSpec s) {
        }

        @Override
        public void onDisconnect() {
        }

        @Override
        public void onListen(TargetSpec t) {
        }

        @Override
        public void onStopListen() {
        }

        @Override
        public void onModeChange() {
        }

        @Override
        public void onRatesApply(int w, int n) {
        }

        @Override
        public void onInvalid(String r) {
        }
    };

    // mode
    private final Combo modeCombo;
    // connection inputs (locked while connected)
    private final StackLayout connStack;
    private final Composite connArea;
    private final Composite[] connByMode;       // indexed by ConnectionMode.ordinal()
    private final Text hostField;
    private final Spinner hostSshPort;
    private final Text hostKeyField;
    private final Combo loginCombo;
    private final Spinner jumpSshPort;
    private final Text jumpKeyField;
    private final List<Control> connectionInputs = new ArrayList<>();
    private final Button connectButton;
    // target inputs (free once connected)
    private final StackLayout targetStack;
    private final Composite targetArea;
    private final Composite[] targetByMode;
    private final Combo localPortCombo;
    private final Combo hostPortCombo;
    private final Combo jumpTargetCombo;
    private final Spinner jumpPort;
    private final Button listenButton;
    // rates
    private final Spinner workerRateSpinner;
    private final Spinner nodeRateSpinner;
    // recents (mutable; mirrored into the combos)
    private final List<Integer> localRecents = new ArrayList<>();
    private final List<Integer> hostRecents = new ArrayList<>();
    private final List<String> jumpRecents = new ArrayList<>();
    private final List<String> jumpLoginRecents = new ArrayList<>();

    private SettingsView.Listener listener = NO_OP;
    private boolean connected = false;
    private boolean listening = false;
    private ConnectionMode shownMode = null;

    public SwtSettingsView(Composite parent, DashboardSettings initial) {
        Composite root = new Composite(parent, SWT.BORDER);
        root.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        GridLayout rootLayout = new GridLayout(1, false);
        rootLayout.marginWidth = 8;
        rootLayout.marginHeight = 6;
        rootLayout.verticalSpacing = 6;
        root.setLayout(rootLayout);

        // ── Row 1: mode + connection fields + Connect/Disconnect ──
        Composite row1 = row(root, 4);
        new Label(row1, SWT.NONE).setText("Mode:");
        modeCombo = new Combo(row1, SWT.DROP_DOWN | SWT.READ_ONLY);
        modeCombo.setItems(MODE_LABELS);

        connArea = new Composite(row1, SWT.NONE);
        connArea.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        connStack = new StackLayout();
        connArea.setLayout(connStack);

        // LOCAL connection: nothing to configure.
        Composite localConn = new Composite(connArea, SWT.NONE);
        localConn.setLayout(zeroGrid(1));
        Label localNote = new Label(localConn, SWT.NONE);
        localNote.setText("gempba on this machine — no SSH.");

        // HOST connection.
        Composite hostConn = new Composite(connArea, SWT.NONE);
        hostConn.setLayout(zeroGrid(7));
        new Label(hostConn, SWT.NONE).setText("SSH host:");
        hostField = new Text(hostConn, SWT.BORDER);
        hostField.setLayoutData(fill(220));
        hostField.setMessage("user@vm-ip");
        new Label(hostConn, SWT.NONE).setText("Port:");
        hostSshPort = sshPortSpinner(hostConn);
        new Label(hostConn, SWT.NONE).setText("Key:");
        hostKeyField = new Text(hostConn, SWT.BORDER);
        hostKeyField.setLayoutData(fill(160));
        hostKeyField.setMessage("(optional)");
        addBrowse(hostConn, hostKeyField);

        // JUMP connection.
        Composite jumpConn = new Composite(connArea, SWT.NONE);
        jumpConn.setLayout(zeroGrid(7));
        new Label(jumpConn, SWT.NONE).setText("Login host:");
        loginCombo = new Combo(jumpConn, SWT.DROP_DOWN);
        loginCombo.setLayoutData(fill(220));
        loginCombo.setToolTipText("The login node you authenticate to, e.g. user@login.cluster.edu. "
                + "Recent login hosts are remembered for jumping between clusters.");
        new Label(jumpConn, SWT.NONE).setText("Port:");
        jumpSshPort = sshPortSpinner(jumpConn);
        new Label(jumpConn, SWT.NONE).setText("Key:");
        jumpKeyField = new Text(jumpConn, SWT.BORDER);
        jumpKeyField.setLayoutData(fill(160));
        jumpKeyField.setMessage("(optional)");
        addBrowse(jumpConn, jumpKeyField);

        connByMode = new Composite[]{localConn, hostConn, jumpConn};
        connectionInputs.add(hostField);
        connectionInputs.add(hostSshPort);
        connectionInputs.add(hostKeyField);
        connectionInputs.add(loginCombo);
        connectionInputs.add(jumpSshPort);
        connectionInputs.add(jumpKeyField);

        connectButton = new Button(row1, SWT.PUSH);
        connectButton.setLayoutData(new GridData(SWT.RIGHT, SWT.CENTER, false, false, 1, 1));
        ((GridData) connectButton.getLayoutData()).widthHint = 100;

        // ── Row 2: target fields + Go ──
        Composite row2 = row(root, 2);
        targetArea = new Composite(row2, SWT.NONE);
        targetArea.setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        targetStack = new StackLayout();
        targetArea.setLayout(targetStack);

        Composite localTarget = new Composite(targetArea, SWT.NONE);
        localTarget.setLayout(zeroGrid(2));
        new Label(localTarget, SWT.NONE).setText("gempba port:");
        localPortCombo = new Combo(localTarget, SWT.DROP_DOWN);
        localPortCombo.setLayoutData(fill(120));

        Composite hostTarget = new Composite(targetArea, SWT.NONE);
        hostTarget.setLayout(zeroGrid(2));
        new Label(hostTarget, SWT.NONE).setText("gempba port:");
        hostPortCombo = new Combo(hostTarget, SWT.DROP_DOWN);
        hostPortCombo.setLayoutData(fill(120));

        Composite jumpTarget = new Composite(targetArea, SWT.NONE);
        jumpTarget.setLayout(zeroGrid(4));
        new Label(jumpTarget, SWT.NONE).setText("Compute node:");
        jumpTargetCombo = new Combo(jumpTarget, SWT.DROP_DOWN);
        jumpTargetCombo.setLayoutData(fill(220));
        jumpTargetCombo.setToolTipText("The compute node running gempba, e.g. fc30557 — find it with squeue. "
                + "Your login account carries over automatically, so just the node name is enough.");
        new Label(jumpTarget, SWT.NONE).setText("Port:");
        jumpPort = new Spinner(jumpTarget, SWT.BORDER);
        jumpPort.setMinimum(1);
        jumpPort.setMaximum(65_535);

        targetByMode = new Composite[]{localTarget, hostTarget, jumpTarget};

        listenButton = new Button(row2, SWT.PUSH);
        listenButton.setText("Listen");
        GridData listenGd = new GridData(SWT.RIGHT, SWT.CENTER, false, false);
        listenGd.widthHint = 100;
        listenButton.setLayoutData(listenGd);

        // ── Row 3: rates ──
        Composite row3 = row(root, 5);
        ((GridLayout) row3.getLayout()).horizontalSpacing = 8;
        new Label(row3, SWT.NONE).setText("Worker rate (ms):");
        workerRateSpinner = rateSpinner(row3, 50, 500, initial.workerIntervalMs());
        new Label(row3, SWT.NONE).setText("Node rate (ms):");
        nodeRateSpinner = rateSpinner(row3, 100, 1000, initial.nodeIntervalMs());
        Button applyRates = new Button(row3, SWT.PUSH);
        applyRates.setText("Apply rates");

        // ── prefill + wiring ──
        applyInitial(initial);
        modeCombo.addListener(SWT.Selection, e -> onModeChanged());
        connectButton.addListener(SWT.Selection, e -> {
            if (connected) {
                listener.onDisconnect();
            } else {
                fireConnect();
            }
        });
        listenButton.addListener(SWT.Selection, e -> {
            if (listening) {
                listener.onStopListen();
            } else {
                fireListen();
            }
        });
        applyRates.addListener(SWT.Selection, e ->
                listener.onRatesApply(workerRateSpinner.getSelection(), nodeRateSpinner.getSelection()));

        // Seed shownMode so the construction-time onModeChanged() lays out the
        // panels without firing onModeChange(); the first real switch will.
        shownMode = currentMode();
        onModeChanged();
        setConnectionState(ConnectionState.DISCONNECTED);
    }

    @Override
    public void setListener(SettingsView.Listener listener) {
        this.listener = (listener != null) ? listener : NO_OP;
    }

    @Override
    public void setConnectionState(ConnectionState state) {
        if (modeCombo.isDisposed()) {
            return;
        }
        connected = state == ConnectionState.CONNECTED || state == ConnectionState.LISTENING;
        listening = state == ConnectionState.LISTENING;
        boolean connecting = state == ConnectionState.CONNECTING;
        ConnectionMode mode = currentMode();

        connectButton.setText(connected ? "Disconnect" : "Connect");
        // LOCAL needs no separate authentication step — Listen does it all.
        boolean showConnect = mode != ConnectionMode.LOCAL || connected;
        setVisible(connectButton, showConnect);
        connectButton.setEnabled(!connecting);
        connectButton.requestLayout();

        boolean fieldsLocked = connected || connecting;
        modeCombo.setEnabled(!fieldsLocked);
        for (Control c : connectionInputs) {
            c.setEnabled(!fieldsLocked);
        }
        // One toggle: "Listen" starts observing the target, "Stop" stops it while
        // keeping the connection. It reverts to "Listen" automatically when the
        // stream ends (gempba finished), driven by the LISTENING→CONNECTED state.
        listenButton.setText(listening ? "Stop" : "Listen");
        listenButton.setEnabled(!connecting && (mode == ConnectionMode.LOCAL || connected));
    }

    /**
     * A snapshot of the current bar state, for persistence.
     */
    public DashboardSettings currentSettings() {
        ConnectionMode lastMode = currentMode();

        DashboardSettings.LocalSettings localSettings = new DashboardSettings.LocalSettings(comboPort(localPortCombo, 9000),
                new ArrayList<>(localRecents));

        DashboardSettings.HostSettings hostSettings = new DashboardSettings.HostSettings(hostField.getText().trim(), hostSshPort.getSelection(),
                hostKeyField.getText().trim(), comboPort(hostPortCombo, 9000), new ArrayList<>(hostRecents));

        DashboardSettings.JumpSettings jumpSettings = new DashboardSettings.JumpSettings(loginCombo.getText().trim(), jumpSshPort.getSelection(),
                jumpKeyField.getText().trim(), jumpTargetCombo.getText().trim(), jumpPort.getSelection(), new ArrayList<>(jumpRecents),
                new ArrayList<>(jumpLoginRecents));

        return new DashboardSettings(lastMode, localSettings, hostSettings, jumpSettings, workerRateSpinner.getSelection(),
                nodeRateSpinner.getSelection());
    }

    // ─── event handlers ──────────────────────────────────────────────────────

    private void onModeChanged() {
        ConnectionMode mode = currentMode();
        connStack.topControl = connByMode[mode.ordinal()];
        targetStack.topControl = targetByMode[mode.ordinal()];
        connArea.layout();
        targetArea.layout();
        // Re-evaluate button visibility/enablement for the new mode.
        setConnectionState(connected ? ConnectionState.LISTENING : ConnectionState.DISCONNECTED);
        // A real mode switch is a new observation context — let the app clear the
        // previous session's tiles/cards. (Skipped on the first, construction-time
        // call and on re-selecting the same mode.)
        if (mode != shownMode) {
            shownMode = mode;
            listener.onModeChange();
        }
    }

    private void fireConnect() {
        ConnectionMode mode = currentMode();
        if (mode == ConnectionMode.HOST && hostField.getText().isBlank()) {
            listener.onInvalid("enter the SSH host (user@vm-ip)");
            return;
        }
        if (mode == ConnectionMode.JUMP && loginCombo.getText().isBlank()) {
            listener.onInvalid("enter the login host (user@login)");
            return;
        }
        if (mode == ConnectionMode.JUMP) {
            pushString(jumpLoginRecents, loginCombo, loginCombo.getText().trim());
        }
        listener.onConnect(buildSession(mode));
    }

    private void fireListen() {
        ConnectionMode mode = currentMode();
        TargetSpec target = buildTarget(mode);
        if (target == null) {
            return; // buildTarget reported the error
        }
        // LOCAL has no separate connect step: ensure connected, then listen.
        if (mode == ConnectionMode.LOCAL && !connected) {
            listener.onConnect(SessionSpec.local());
        }
        rememberTarget(mode, target);
        listener.onListen(target);
    }

    // ─── builders ──────────────────────────────────────────────────────────--

    private SessionSpec buildSession(ConnectionMode mode) {
        return switch (mode) {
            case LOCAL -> SessionSpec.local();
            case HOST -> new SessionSpec(ConnectionMode.HOST, hostField.getText().trim(),
                    hostSshPort.getSelection(), hostKeyField.getText().trim(), SessionSpec.AuthMethod.SSH_KEY);
            case JUMP -> new SessionSpec(ConnectionMode.JUMP, loginCombo.getText().trim(),
                    jumpSshPort.getSelection(), jumpKeyField.getText().trim(), SessionSpec.AuthMethod.SSH_KEY);
        };
    }

    private TargetSpec buildTarget(ConnectionMode mode) {
        return switch (mode) {
            case LOCAL -> portTarget("", localPortCombo);
            case HOST -> portTarget("", hostPortCombo);
            case JUMP -> {
                String node = jumpTargetCombo.getText().trim();
                if (node.isBlank()) {
                    listener.onInvalid("enter the compute node to observe (user@node)");
                    yield null;
                }
                yield new TargetSpec(node, jumpPort.getSelection());
            }
        };
    }

    private TargetSpec portTarget(String host, Combo portCombo) {
        int port = parsePort(portCombo.getText().trim());
        if (port < 0) {
            listener.onInvalid("invalid gempba port (must be 1–65535)");
            return null;
        }
        return new TargetSpec(host, port);
    }

    // ─── recents ───────────────────────────────────────────────────────────--

    private void rememberTarget(ConnectionMode mode, TargetSpec target) {
        switch (mode) {
            case LOCAL -> pushPort(localRecents, localPortCombo, target.gempbaPort());
            case HOST -> pushPort(hostRecents, hostPortCombo, target.gempbaPort());
            case JUMP -> pushString(jumpRecents, jumpTargetCombo, target.targetHost());
        }
    }

    private void pushPort(List<Integer> recents, Combo combo, int port) {
        recents.remove(Integer.valueOf(port));
        recents.add(0, port);
        while (recents.size() > RECENTS_CAP) {
            recents.remove(recents.size() - 1);
        }
        String text = String.valueOf(port);
        combo.setItems(recents.stream().map(String::valueOf).toArray(String[]::new));
        combo.setText(text);
    }

    private void pushString(List<String> recents, Combo combo, String value) {
        recents.remove(value);
        recents.add(0, value);
        while (recents.size() > RECENTS_CAP) {
            recents.remove(recents.size() - 1);
        }
        combo.setItems(recents.toArray(new String[0]));
        combo.setText(value);
    }

    // ─── prefill + small helpers ─────────────────────────────────────────────

    private void applyInitial(DashboardSettings s) {
        modeCombo.select(s.lastMode().ordinal());

        hostField.setText(s.host().host());
        hostSshPort.setSelection(s.host().sshPort());
        hostKeyField.setText(s.host().sshKey());
        jumpSshPort.setSelection(s.jump().sshPort());
        jumpKeyField.setText(s.jump().sshKey());

        localRecents.addAll(s.local().recentPorts());
        hostRecents.addAll(s.host().recentPorts());
        jumpRecents.addAll(s.jump().recentTargets());
        jumpLoginRecents.addAll(s.jump().recentLoginHosts());
        localPortCombo.setItems(localRecents.stream().map(String::valueOf).toArray(String[]::new));
        hostPortCombo.setItems(hostRecents.stream().map(String::valueOf).toArray(String[]::new));
        jumpTargetCombo.setItems(jumpRecents.toArray(new String[0]));
        loginCombo.setItems(jumpLoginRecents.toArray(new String[0]));
        localPortCombo.setText(String.valueOf(s.local().gempbaPort()));
        hostPortCombo.setText(String.valueOf(s.host().gempbaPort()));
        jumpTargetCombo.setText(s.jump().targetHost());
        loginCombo.setText(s.jump().loginHost());
        jumpPort.setSelection(s.jump().gempbaPort());
    }

    private ConnectionMode currentMode() {
        int i = modeCombo.getSelectionIndex();
        return switch (i) {
            case 1 -> ConnectionMode.HOST;
            case 2 -> ConnectionMode.JUMP;
            default -> ConnectionMode.LOCAL;
        };
    }

    private void addBrowse(Composite parent, Text keyField) {
        Button browse = new Button(parent, SWT.PUSH);
        browse.setText("Browse…");
        connectionInputs.add(browse);
        browse.addListener(SWT.Selection, e -> {
            FileDialog dialog = new FileDialog(parent.getShell(), SWT.OPEN);
            dialog.setText("Select SSH private key");
            dialog.setFilterNames(new String[]{"All files", "PEM keys", "PuTTY keys"});
            dialog.setFilterExtensions(new String[]{"*.*", "*.pem", "*.ppk"});
            String path = dialog.open();
            if (path != null) {
                keyField.setText(path);
            }
        });
    }

    private static Spinner sshPortSpinner(Composite parent) {
        Spinner s = new Spinner(parent, SWT.BORDER);
        s.setMinimum(1);
        s.setMaximum(65_535);
        s.setSelection(SessionSpec.DEFAULT_SSH_PORT);
        return s;
    }

    private static Spinner rateSpinner(Composite parent, int increment, int pageIncrement, int value) {
        Spinner s = new Spinner(parent, SWT.BORDER);
        s.setMinimum(RefreshInterval.MIN_MS);
        s.setMaximum(RefreshInterval.MAX_MS);
        s.setIncrement(increment);
        s.setPageIncrement(pageIncrement);
        s.setSelection(value);
        return s;
    }

    private static int parsePort(String s) {
        try {
            int p = Integer.parseInt(s);
            return (p < 1 || p > 65_535) ? -1 : p;
        } catch (NumberFormatException ex) {
            return -1;
        }
    }

    private static int comboPort(Combo combo, int fallback) {
        int p = parsePort(combo.getText().trim());
        return p < 0 ? fallback : p;
    }

    private static Composite row(Composite parent, int columns) {
        Composite row = new Composite(parent, SWT.NONE);
        row.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        row.setLayout(zeroGrid(columns));
        return row;
    }

    private static GridLayout zeroGrid(int columns) {
        GridLayout layout = new GridLayout(columns, false);
        layout.marginWidth = 0;
        layout.marginHeight = 0;
        layout.horizontalSpacing = 6;
        return layout;
    }

    private static GridData fill(int widthHint) {
        GridData gd = new GridData(SWT.FILL, SWT.CENTER, true, false);
        gd.widthHint = widthHint;
        return gd;
    }

    private static void setVisible(Control c, boolean visible) {
        c.setVisible(visible);
        Object ld = c.getLayoutData();
        if (ld instanceof GridData gd) {
            gd.exclude = !visible;
        }
    }
}
