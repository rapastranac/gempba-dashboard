package io.gempba.dashboard.app;

import io.gempba.dashboard.protocol.BroadcastEnvelope;
import org.eclipse.swt.widgets.Display;

import java.util.function.Consumer;

/**
 * Decouples telemetry-frame <em>arrival</em> from UI <em>render</em> cadence.
 * <p>
 * gempba can emit frames as fast as every 50&nbsp;ms (20&nbsp;Hz), and under
 * heavy CPU load the SWT event loop can stall and then receive a burst of
 * queued frames at once. Rendering each one means a full pass over the card
 * hierarchy; doing that faster than the eye resolves is wasted work and a
 * source of visible flicker.
 * <p>
 * This coalescer keeps only the most-recent frame and hands it to the
 * {@code sink} on a fixed minimum interval (~30&nbsp;fps). Intermediate
 * frames are dropped — the dashboard only ever shows the latest state, which
 * is exactly what a live monitor wants. The timer is event-driven: it arms
 * on {@link #submit} and goes idle when no frames are pending, so a
 * disconnected or quiet dashboard costs nothing.
 * <p>
 * <strong>Threading:</strong> {@link #submit} and the internal tick both run
 * on the SWT UI thread (the owning controller hops frames there before
 * calling {@code submit}). No locks are needed; the single pending slot is
 * plain UI-thread state.
 */
final class FrameCoalescer {

    private final Display display;
    private final int intervalMs;
    private final Consumer<BroadcastEnvelope> sink;

    private BroadcastEnvelope pending;
    private boolean tickScheduled;

    FrameCoalescer(Display display, int intervalMs, Consumer<BroadcastEnvelope> sink) {
        this.display = display;
        this.intervalMs = intervalMs;
        this.sink = sink;
    }

    /**
     * Offer a frame for rendering. Keeps only the latest; if a render isn't
     * already pending, schedules one {@code intervalMs} from now. Must be
     * called on the SWT UI thread.
     */
    void submit(BroadcastEnvelope frame) {
        pending = frame;
        if (!tickScheduled && !display.isDisposed()) {
            tickScheduled = true;
            display.timerExec(intervalMs, this::tick);
        }
    }

    private void tick() {
        tickScheduled = false;
        if (display.isDisposed()) {
            return;
        }
        BroadcastEnvelope frame = pending;
        pending = null;
        if (frame != null) {
            sink.accept(frame);
        }
        // Any frame that arrived while we were rendering will re-arm the
        // timer through its own submit() call, so there's nothing to
        // reschedule here.
    }
}
