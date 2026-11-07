import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import { CommandRegistry } from '@theia/core/lib/common/command';
import * as React from '@theia/core/shared/react';
import { StreamText } from '@gempba/core';
import { TelemetryViewActions } from '@gempba/telemetry/lib/browser';
import { TelemetryService } from '@gempba/telemetry/lib/common';
import { EmptyState, LivenessWatch, StreamBar } from '@gempba/ui/lib/browser';

/**
 * What the Cards view shows above its tree and details: the empty state while the hub holds no nodes, the stream bar
 * while the data isn't live, and nothing while it is. The Cards view hides its panes while this shows the empty state.
 */
export class CardsBannerWidget extends ReactWidget {

    static readonly EMPTY_CLASS = 'gempba-cards-banner-empty';

    /** Redraws the bar as its age ticks; the view refreshes it on every hub event. */
    protected readonly ticks = new LivenessWatch<string>(this, () => this.bar()?.text ?? '', () => this.update());

    constructor(protected readonly telemetry: TelemetryService, protected readonly commands: CommandRegistry) {
        super();
        this.addClass('gempba-cards-banner');
        this.node.tabIndex = -1;
        this.toDispose.push(this.ticks);
    }

    /** Whether the hub holds nodes to show. */
    get hasNodes(): boolean {
        return (this.telemetry.snapshot?.nodes.length ?? 0) > 0;
    }

    protected render(): React.ReactNode {
        if (!this.hasNodes) {
            this.ticks.none();
            return <EmptyState icon='list-tree' title='No nodes yet'
                message='Listen to a gempba run on this machine, or connect to a cluster, to see its nodes, sockets and ranks here.'
                actions={TelemetryViewActions.start(this.commands)} />;
        }
        const bar = this.bar();
        if (!bar) {
            this.ticks.none();
            return undefined;
        }
        this.ticks.drawn(bar.text);
        return <StreamBar tone={bar.tone} text={bar.text} actions={TelemetryViewActions.bar(this.commands, bar.actions)} />;
    }

    protected bar(): StreamText.Bar | undefined {
        return StreamText.bar(this.telemetry.condition, this.telemetry.lastFrameAt, Date.now());
    }
}
