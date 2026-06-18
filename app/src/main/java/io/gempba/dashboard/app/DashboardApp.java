package io.gempba.dashboard.app;

import io.gempba.dashboard.config.*;
import io.gempba.dashboard.connection.ConnectionController;
import io.gempba.dashboard.history.NodeHistoryStore;
import io.gempba.dashboard.presenter.*;
import io.gempba.dashboard.settings.SettingsStore;
import io.gempba.dashboard.telemetry.TelemetryStore;
import io.gempba.dashboard.ui.*;
import io.gempba.dashboard.ui.auth.SwtAuthPrompt;
import io.gempba.dashboard.ui.settings.SwtSettingsView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.*;

import java.nio.file.Path;
import java.util.List;

/**
 * The composition root. Builds the SWT {@link Display}/{@link Shell}, menu, and
 * widgets, constructs the presenters and the {@link DashboardCoordinator}, wires
 * the object graph, and runs the event loop. It owns no render or dispatch
 * logic — the frame pipeline lives in the coordinator, per-view projection in
 * the presenters, and rendering in the SWT views.
 * <p>
 * One instance per process. {@link #run()} is blocking — it returns only after
 * the user closes the shell.
 */
public final class DashboardApp {

    /**
     * Minimum gap between full renders (~30&nbsp;fps); see {@link FrameCoalescer}.
     */
    private static final int RENDER_INTERVAL_MS = 33;

    /**
     * Tab order in the content area (also the presenter list index).
     */
    private static final int GRID_TAB = 0;

    private final String[] args;

    public DashboardApp(String[] args) {
        this.args = args;
    }

    private static void buildMenuBar(Shell shell) {
        Menu menuBar = new Menu(shell, SWT.BAR);
        shell.setMenuBar(menuBar);

        MenuItem fileItem = new MenuItem(menuBar, SWT.CASCADE);
        fileItem.setText("&File");
        Menu fileMenu = new Menu(menuBar);
        fileItem.setMenu(fileMenu);

        MenuItem exit = new MenuItem(fileMenu, SWT.PUSH);
        exit.setText("E&xit\tCtrl+Q");
        exit.setAccelerator(SWT.MOD1 | 'Q');
        exit.addListener(SWT.Selection, e -> shell.close());

        MenuItem helpItem = new MenuItem(menuBar, SWT.CASCADE);
        helpItem.setText("&Help");
        Menu helpMenu = new Menu(menuBar);
        helpItem.setMenu(helpMenu);

        MenuItem about = new MenuItem(helpMenu, SWT.PUSH);
        about.setText("&About");
        about.addListener(SWT.Selection, e -> AboutDialog.show(shell));
    }

    /**
     * Overlay any CLI/env ssh hints onto the saved settings: a jump host implies
     * JUMP (ssh host becomes the compute target), an ssh host alone implies HOST;
     * otherwise the saved settings stand. Precedence: CLI/env over saved over
     * defaults.
     */
    private static DashboardSettings applyCliOverlay(DashboardSettings saved, Config cli) {
        if (!cli.jumpHost().isBlank()) {
            DashboardSettings.JumpSettings jumpSettings = new DashboardSettings.JumpSettings(
                    cli.jumpHost(), SessionSpec.DEFAULT_SSH_PORT, cli.sshKey(),
                    cli.sshHost(), cli.port(), saved.jump().recentTargets(), saved.jump().recentLoginHosts());

            return new DashboardSettings(ConnectionMode.JUMP, saved.local(), saved.host(), jumpSettings, saved.workerIntervalMs(), saved.nodeIntervalMs());
        }
        if (!cli.sshHost().isBlank()) {
            DashboardSettings.HostSettings hostSettings = new DashboardSettings.HostSettings(
                    cli.sshHost(), SessionSpec.DEFAULT_SSH_PORT, cli.sshKey(),
                    cli.port(), saved.host().recentPorts());

            return new DashboardSettings(ConnectionMode.HOST, saved.local(), hostSettings, saved.jump(), saved.workerIntervalMs(), saved.nodeIntervalMs());
        }
        return saved;
    }

    public void run() {
        Config initialConfig = Config.from(args);
        SettingsStore store = SettingsStore.atDefaultLocation();
        // Saved UI state seeds the bar; any CLI/env ssh hints overlay it.
        DashboardSettings seed = applyCliOverlay(store.load(), initialConfig);

        Display display = new Display();
        Shell shell = new Shell(display);
        shell.setText("GemPBA Dashboard");
        shell.setSize(1060, 1024);
        shell.setLayout(new GridLayout(1, false));

        Image[] appIcons = AppIcons.load(display);
        if (appIcons.length > 0) {
            shell.setImages(appIcons);
        }

        buildMenuBar(shell);

        // ─── views (top to bottom) ──────────────────────────────────────────
        SwtSettingsView settings = new SwtSettingsView(shell, seed);

        Composite statusRow = new Composite(shell, SWT.NONE);
        statusRow.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        GridLayout statusLayout = new GridLayout(1, false);
        statusLayout.marginWidth = 8;
        statusLayout.marginHeight = 2;
        statusLayout.horizontalSpacing = 10;
        statusRow.setLayout(statusLayout);

        SwtStatusView statusBanner = new SwtStatusView(statusRow);
        statusBanner.control().setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        statusBanner.setStatus("disconnected — pick a connection and press Connect (Local: just press Listen)");

        TabFolder tabs = new TabFolder(shell, SWT.NONE);
        tabs.setLayoutData(new GridData(SWT.FILL, SWT.FILL, true, true));

        TabItem gridTab = new TabItem(tabs, SWT.NONE);
        gridTab.setText("Grid");
        SwtGridView swtGridView = new SwtGridView(tabs);
        gridTab.setControl(swtGridView.control());

        TabItem cardsTab = new TabItem(tabs, SWT.NONE);
        cardsTab.setText("Cards");
        SwtCardsView swtCardsView = new SwtCardsView(tabs);
        cardsTab.setControl(swtCardsView.control());

        tabs.setSelection(GRID_TAB); // Grid is the landing tab.

        // ─── model side + presenters (SWT-free) ─────────────────────────────
        NodeHistoryStore historyStore = new NodeHistoryStore();
        TelemetryStore telemetryStore = new TelemetryStore();
        DetailWindowsPresenter detailWindows = new DetailWindowsPresenter(host -> new SwtDetailView(shell, host));

        GridPresenter gridPresenter = new GridPresenter(swtGridView, historyStore, detailWindows::openOrFocus);
        CardsPresenter cardsPresenter = new CardsPresenter(swtCardsView);

        // Tab presenters in tab order (list index = tab index); the frame
        // fan-out additionally reaches the always-on detail windows.
        List<TabPresenter<?>> tabPresenters = List.of(gridPresenter, cardsPresenter);
        List<Presenter> presenters = List.of(gridPresenter, cardsPresenter, detailWindows);
        DashboardCoordinator coordinator = new DashboardCoordinator(
                display, RENDER_INTERVAL_MS, telemetryStore,
                presenters, tabPresenters, statusBanner,
                settings, store,
                tabs::getSelectionIndex);

        tabs.addListener(SWT.Selection, e -> coordinator.onTabChanged());

        // ─── connection controller (owns clients, tunnels, sticky rates) ────
        // The coordinator is the controller's Listener (status + frames); the
        // controller hops to the UI thread internally before calling it. The
        // AuthPrompt lets the embedded SSH client raise Duo / host-key / setup
        // dialogs on this shell; known_hosts backs its trust-on-first-use.
        SwtAuthPrompt authPrompt = new SwtAuthPrompt(display, shell);
        Path knownHosts = Path.of(System.getProperty("user.home"), ".ssh", "known_hosts");
        ConnectionController controller = new ConnectionController(
                new SwtUiExecutor(display), coordinator, authPrompt, knownHosts,
                RefreshInterval.DEFAULT_WORKER_MS, RefreshInterval.DEFAULT_NODE_MS);

        coordinator.bind(controller);
        settings.setListener(coordinator);

        coordinator.start();             // sync presenter active-state to the Grid tab

        // No auto-connect: the bar is pre-filled from saved settings and waits
        // for the user to press Connect, so launching the app never fires an
        // unprompted MFA challenge.

        shell.addListener(SWT.Close, e -> {
            // Close detail windows before the controller so no late frame races
            // a half-disposed dialog. Persist the bar's state on the way out.
            detailWindows.clear();
            store.save(settings.currentSettings());
            controller.close();
        });

        shell.open();
        while (!shell.isDisposed()) {
            if (!display.readAndDispatch()) {
                display.sleep();
            }
        }
        for (Image icon : appIcons) {
            if (!icon.isDisposed()) {
                icon.dispose();
            }
        }
        display.dispose();
    }
}
