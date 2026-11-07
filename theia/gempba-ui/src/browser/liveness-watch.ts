import { Disposable } from '@theia/core/lib/common/disposable';

/**
 * Redraws a live view when what its liveness shows would change. Frames that stop arriving send no event to redraw on,
 * so the watch rechecks once a second while the view is visible, against what the view last drew. Dispose it with the view.
 */
export class LivenessWatch<T> implements Disposable {

    /** How often to recheck: liveness reads in whole seconds. */
    static readonly CHECK_MS = 1000;

    protected shown: T | undefined;
    protected readonly timer: ReturnType<typeof setInterval>;

    /** `read` gives what the view's liveness shows now; `redraw` redraws the view, which calls {@link drawn} again. */
    constructor(view: { readonly isVisible: boolean }, protected readonly read: () => T, redraw: () => void, checkMs = LivenessWatch.CHECK_MS) {
        this.timer = setInterval(() => {
            if (view.isVisible && this.shown !== undefined && this.read() !== this.shown) {
                redraw();
            }
        }, checkMs);
    }

    /** Notes what the view's liveness shows as it draws, and returns it. */
    drawn(shown: T): T {
        this.shown = shown;
        return shown;
    }

    /** Notes that the view shows no liveness, which pauses the checks until it does again. */
    none(): void {
        this.shown = undefined;
    }

    dispose(): void {
        clearInterval(this.timer);
    }
}
