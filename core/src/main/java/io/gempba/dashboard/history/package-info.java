/**
 * Rolling per-node history derived from the read-model — pure data, no SWT.
 * <p>
 * Holds {@link io.gempba.dashboard.history.NodeHistoryStore}, the rolling
 * per-node utilization buffer that backs the tile grid's sparklines (the
 * read-model is per-frame and keeps no history of its own).
 * {@link io.gempba.dashboard.history.NodeSeries} and
 * {@link io.gempba.dashboard.history.NodeSample} are the immutable slices it
 * hands out. It folds each {@link io.gempba.dashboard.model.WorldSnapshot}
 * frame by frame — fed by the grid presenter from the read-model; it never
 * sees the wire.
 */
package io.gempba.dashboard.history;
