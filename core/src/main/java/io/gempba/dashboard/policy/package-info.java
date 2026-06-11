/**
 * Pure domain policies: arithmetic and rules that define what the dashboard
 * <em>means</em>, independent of any wire format or UI toolkit. The
 * per-allocation node-CPU formula lives here so it can be reasoned about and
 * tested on its own; callers gather the inputs and render the outputs. Part of
 * {@code core}.
 */
package io.gempba.dashboard.policy;
