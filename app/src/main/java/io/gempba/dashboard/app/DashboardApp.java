package io.gempba.dashboard.app;

import io.gempba.dashboard.config.Config;
import io.gempba.dashboard.config.ConnectionSpec;
import io.gempba.dashboard.config.RefreshInterval;
import io.gempba.dashboard.connection.ConnectionController;
import io.gempba.dashboard.history.NodeHistoryStore;
import io.gempba.dashboard.presenter.*;
import io.gempba.dashboard.telemetry.TelemetryStore;
import io.gempba.dashboard.ui.*;
import io.gempba.dashboard.ui.settings.SwtSettingsView;
import org.eclipse.swt.SWT;
import org.eclipse.swt.graphics.Image;
import org.eclipse.swt.layout.GridData;
import org.eclipse.swt.layout.GridLayout;
import org.eclipse.swt.widgets.*;

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
     * gempba's center TCP server hardcodes loopback in
     * {@code center_tcp_server.cpp}, so the dashboard always dials this for the
     * initial status display (the actual connection details live inside
     * {@link ConnectionController}).
     */
    private static final String LOOPBACK = "127.0.0.1";

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

    public void run() {
        Config initialConfig = Config.from(args);

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
        SwtSettingsView settings = new SwtSettingsView(shell, initialConfig);

        Composite statusRow = new Composite(shell, SWT.NONE);
        statusRow.setLayoutData(new GridData(SWT.FILL, SWT.TOP, true, false));
        GridLayout statusLayout = new GridLayout(2, false);
        statusLayout.marginWidth = 8;
        statusLayout.marginHeight = 2;
        statusLayout.horizontalSpacing = 10;
        statusRow.setLayout(statusLayout);

        LiveToggle liveToggle = new LiveToggle(statusRow);
        liveToggle.setLayoutData(new GridData(SWT.LEFT, SWT.CENTER, false, false));

        SwtStatusView statusBanner = new SwtStatusView(statusRow);
        statusBanner.control().setLayoutData(new GridData(SWT.FILL, SWT.CENTER, true, false));
        statusBanner.setStatus("disconnected — target " + LOOPBACK + ":" + initialConfig.port());

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
                tabs::getSelectionIndex);

        tabs.addListener(SWT.Selection, e -> coordinator.onTabChanged());

        // ─── connection controller (owns clients, tunnels, sticky rates) ────
        // The coordinator is the controller's Listener (status + frames); the
        // controller hops to the UI thread internally before calling it.
        ConnectionController controller = new ConnectionController(
                new SwtUiExecutor(display), coordinator,
                RefreshInterval.DEFAULT_WORKER_MS, RefreshInterval.DEFAULT_NODE_MS);

        coordinator.bind(controller, liveToggle);
        liveToggle.setListener(controller::setLive);
        settings.setListener(coordinator);

        coordinator.start();             // sync presenter active-state to the Grid tab

        ConnectionSpec connectionSpec = new ConnectionSpec(
                initialConfig.port(),
                initialConfig.sshHost(),
                initialConfig.jumpHost(),
                initialConfig.sshKey(),
                false,
                "");
        controller.connect(connectionSpec);

        shell.addListener(SWT.Close, e -> {
            // Close detail windows before the controller so no late frame races
            // a half-disposed dialog.
            detailWindows.clear();
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
