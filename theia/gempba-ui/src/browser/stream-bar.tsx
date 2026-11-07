import * as React from '@theia/core/shared/react';
import { Liveness } from '../common/liveness';

export interface StreamBarAction {
    readonly label: string;
    /** A codicon name, such as `debug-continue`. */
    readonly icon?: string;
    readonly run: () => void;
}

export interface StreamBarProps {
    /** Which liveness colour marks the bar: paused, run ended, waiting or not streaming. */
    readonly tone: Liveness;
    readonly text: string;
    readonly actions?: readonly StreamBarAction[];
}

/**
 * The bar across a live view's top while its data isn't live: why, since when, and what brings it back. The view under
 * it stays as it was and fully usable, dimmed with {@link StreamBar.FROZEN_CLASS} while the data is frozen.
 */
export function StreamBar({ tone, text, actions }: StreamBarProps): React.ReactElement {
    return <div className={`gempba-stream-bar gempba-stream-bar-${tone}`} role='status'>
        <span className={`gempba-live gempba-live-${tone} gempba-live-compact`} aria-hidden={true}>
            <span className='gempba-live-dot' />
        </span>
        <span className='gempba-stream-bar-text' title={text}>{text}</span>
        {actions && actions.length > 0 && <span className='gempba-stream-bar-actions'>
            {actions.map(action => <button key={action.label} type='button' className='theia-button secondary' onClick={action.run}>
                {action.icon && <span className={`codicon codicon-${action.icon}`} aria-hidden={true} />}
                {action.label}
            </button>)}
        </span>}
    </div>;
}

export namespace StreamBar {
    /** Dims a view's content under the bar while its data is frozen; the content stays usable. */
    export const FROZEN_CLASS = 'gempba-frozen';
}
