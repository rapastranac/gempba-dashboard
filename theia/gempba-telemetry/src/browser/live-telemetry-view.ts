import { Widget } from '@theia/core/lib/browser/widgets/widget';

/** The mark of a view that draws live telemetry: the hub shows the live controls on its tab. */
export namespace LiveTelemetryView {

    export const CLASS = 'gempba-live-telemetry';

    export function mark(widget: Widget): void {
        widget.addClass(CLASS);
    }

    export function is(widget: Widget | undefined): boolean {
        return widget?.hasClass(CLASS) ?? false;
    }
}
