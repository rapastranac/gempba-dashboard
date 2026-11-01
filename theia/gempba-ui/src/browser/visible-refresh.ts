import { Disposable } from '@theia/core/lib/common/disposable';
import { IMessageHandler, Message, MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { Widget } from '@theia/core/shared/@lumino/widgets';
import { RefreshGate } from '../common/refresh-gate';

/**
 * A {@link RefreshGate} for a widget: refreshes only while the widget is visible and its window is not hidden
 * (minimized, or covered where the platform reports it), and catches up when either is shown again. It redraws at
 * most every {@link MIN_INTERVAL_MS} by default, however fast frames arrive. Dispose it with the widget.
 */
export class VisibleRefresh implements Disposable {

    /** Ten redraws a second: as fast as a reader follows numbers, while the histories still record every frame. */
    static readonly MIN_INTERVAL_MS = 100;

    protected readonly gate: RefreshGate;
    protected readonly hook = (_handler: IMessageHandler, message: Message): boolean => {
        if (message.type === 'after-show') {
            Promise.resolve().then(() => this.gate.shown());
        }
        return true;
    };
    protected readonly onVisibilityChange = (): void => {
        if (document.visibilityState === 'visible') {
            this.gate.shown();
        }
    };

    constructor(protected readonly widget: Widget, refresh: () => void | Promise<void>, minIntervalMs = VisibleRefresh.MIN_INTERVAL_MS) {
        this.gate = new RefreshGate(() => widget.isVisible && document.visibilityState !== 'hidden', refresh, minIntervalMs);
        MessageLoop.installMessageHook(widget, this.hook);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    request(): void {
        this.gate.request();
    }

    dispose(): void {
        this.gate.dispose();
        MessageLoop.removeMessageHook(this.widget, this.hook);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
}
