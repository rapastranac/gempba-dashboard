/**
 * Threading ports. {@link io.gempba.dashboard.concurrent.UiExecutor} abstracts
 * "run this on the UI thread" so background-thread code can marshal callbacks
 * onto the UI without depending on a specific UI toolkit. Part of {@code core}.
 */
package io.gempba.dashboard.concurrent;
