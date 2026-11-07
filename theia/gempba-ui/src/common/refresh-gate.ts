/**
 * Lets a view skip work nobody can see. A refresh requested while the view is hidden (a background tab, a
 * collapsed panel) only marks it stale, and runs once when the view is shown; requests arriving while an
 * asynchronous refresh runs fold into one more run, so a fast stream never queues up redraws. With a minimum
 * interval, a request sooner than that after the last refresh waits for it, and the requests meanwhile fold into
 * that one, so a view redraws at most that often and always ends on the latest state.
 */
export class RefreshGate {

    protected stale = false;
    protected running = false;
    protected lastRunAt = Number.NEGATIVE_INFINITY;
    protected waiting: ReturnType<typeof setTimeout> | undefined;

    constructor(protected readonly isVisible: () => boolean, protected readonly refresh: () => void | Promise<void>,
        protected readonly minIntervalMs = 0, protected readonly now: () => number = () => Date.now()) { }

    request(): void {
        if (!this.isVisible() || this.running) {
            this.stale = true;
            return;
        }
        const wait = this.lastRunAt + this.minIntervalMs - this.now();
        if (wait > 0) {
            this.stale = true;
            this.waiting ??= setTimeout(() => {
                this.waiting = undefined;
                if (this.stale) {
                    this.request();
                }
            }, wait);
            return;
        }
        this.stale = false;
        this.running = true;
        this.lastRunAt = this.now();
        Promise.resolve().then(this.refresh).catch(() => undefined).finally(() => {
            this.running = false;
            if (this.stale) {
                this.request();
            }
        });
    }

    /** The view became visible: catch up on what it missed. */
    shown(): void {
        if (this.stale) {
            this.request();
        }
    }

    /** Drops a refresh waiting for its interval. */
    dispose(): void {
        clearTimeout(this.waiting);
        this.waiting = undefined;
        this.stale = false;
    }
}
