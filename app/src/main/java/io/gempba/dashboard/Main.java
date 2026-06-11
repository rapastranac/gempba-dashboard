package io.gempba.dashboard;

import io.gempba.dashboard.app.DashboardApp;

/**
 * Process entry point. Intentionally a one-liner: the actual application
 * lives in {@link DashboardApp}. Keeping this class trivial makes it clear
 * that {@code Main} is just where the JVM looks first, not where the app
 * is constructed — and gives us a stable {@code main} signature to point
 * jar manifests, IDE run configurations, and packaging tools at.
 */
public final class Main {

    private Main() {
    }

    public static void main(String[] args) {
        new DashboardApp(args).run();
    }
}
