import { Disposable } from '@theia/core/lib/common/disposable';
import { IMessageHandler, Message, MessageLoop } from '@theia/core/shared/@lumino/messaging';
import { Widget } from '@theia/core/shared/@lumino/widgets';
import { RefreshGate } from '../common/refresh-gate';

/**
 * A {@link RefreshGate} for a widget: refreshes only while the widget is visible and its window is not hidden
 * (minimized, or covered where the platform reports it), and catches up when either is shown again. Dispose it
 * with the widget.
 */
export class VisibleRefresh implements Disposable {

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

    constructor(protected readonly widget: Widget, refresh: () => void | Promise<void>) {
        this.gate = new RefreshGate(() => widget.isVisible && document.visibilityState !== 'hidden', refresh);
        MessageLoop.installMessageHook(widget, this.hook);
        document.addEventListener('visibilitychange', this.onVisibilityChange);
    }

    request(): void {
        this.gate.request();
    }

    dispose(): void {
        MessageLoop.removeMessageHook(this.widget, this.hook);
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
}
