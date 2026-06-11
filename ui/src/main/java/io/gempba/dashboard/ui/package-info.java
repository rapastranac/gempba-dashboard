/**
 * The SWT render-only views. The card hierarchy (World → Node → Socket → Worker →
 * Cores), the Task-Manager-style tile grid, the live detail window, the
 * outgoing-peers dialog, and the custom-painted widgets (sparkline, live
 * toggle). Every view renders a domain read-model pushed in from outside and
 * implements the core view contracts where one exists — it holds no telemetry
 * state and pulls no data.
 * <p>
 * Depends on {@code core} and SWT only. It has no dependency on the
 * {@code adapters} module, so it physically cannot import the wire
 * {@code protocol} — the architecture's central rule, enforced by the compiler.
 */
package io.gempba.dashboard.ui;
