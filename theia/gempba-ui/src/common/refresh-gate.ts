/**
 * Lets a view skip work nobody can see. A refresh requested while the view is hidden (a background tab, a
 * collapsed panel) only marks it stale, and runs once when the view is shown; requests arriving while an
 * asynchronous refresh runs fold into one more run, so a fast stream never queues up redraws.
 */
export class RefreshGate {

    protected stale = false;
    protected running = false;

    constructor(protected readonly isVisible: () => boolean, protected readonly refresh: () => void | Promise<void>) { }

    request(): void {
        if (!this.isVisible() || this.running) {
            this.stale = true;
            return;
        }
        this.stale = false;
        this.running = true;
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
}
