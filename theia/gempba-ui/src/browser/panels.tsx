import * as React from '@theia/core/shared/react';
import { Trend } from '../common/trend';
import { ChartTone } from './components';

export interface PanelProps {
    readonly title: string;
    /** Controls at the right of the title, such as a range picker. */
    readonly actions?: React.ReactNode;
    readonly className?: string;
    readonly children?: React.ReactNode;
}

/** A titled section of an instrument panel, such as CPU or Throughput, holding headline figures, charts or tables. */
export function Panel({ title, actions, className, children }: PanelProps): React.ReactElement {
    return <section className={className ? `gempba-panel ${className}` : 'gempba-panel'} aria-label={title}>
        <header className='gempba-panel-header'>
            <h3 className='gempba-panel-title'>{title}</h3>
            {actions && <div className='gempba-panel-actions'>{actions}</div>}
        </header>
        {children}
    </section>;
}

export interface HeroStatProps {
    readonly label: string;
    /** The figure, already formatted, such as `12.4k`. */
    readonly value: string;
    readonly unit?: string;
    /** A line under the figure, such as `6.9 of 8 cores`. */
    readonly detail?: string;
    readonly trend?: Trend;
    /** Colors the trend arrow like the chart of the same figure. */
    readonly tone?: ChartTone;
    /** What the figure counts, on hover. */
    readonly hint?: string;
}

const TREND_ARROWS = { up: ['arrow-up', 'rising'], down: ['arrow-down', 'falling'] } as const;

/** A headline figure: a small label over a large number with its unit, the way it trends, and a detail line. */
export function HeroStat({ label, value, unit, detail, trend, tone, hint }: HeroStatProps): React.ReactElement {
    const arrow = trend && trend.direction !== 'flat' ? TREND_ARROWS[trend.direction] : undefined;
    const trendWords = arrow && (trend?.change === undefined ? arrow[1] : `${arrow[1]} ${Math.round(Math.abs(trend.change) * 100)}%`);
    return <div className={tone ? `gempba-hero gempba-tone-${tone}` : 'gempba-hero'} title={hint}>
        <span className='gempba-hero-label'>{label}</span>
        <span className='gempba-hero-value'>
            {value}
            {unit && <span className='gempba-hero-unit'>{unit}</span>}
            {arrow && <span className={`gempba-hero-trend codicon codicon-${arrow[0]}`} role='img' aria-label={trendWords} title={trendWords} />}
        </span>
        {detail && <span className='gempba-hero-detail'>{detail}</span>}
    </div>;
}

export interface SegmentedOption<T extends string> {
    readonly value: T;
    readonly label: string;
    readonly title?: string;
}

export interface SegmentedControlProps<T extends string> {
    readonly label: string;
    readonly options: ReadonlyArray<SegmentedOption<T>>;
    readonly value: T;
    readonly onChange: (value: T) => void;
    readonly disabled?: boolean;
}

/** A row of mutually exclusive choices, such as the connection modes, all in view at once. */
export function SegmentedControl<T extends string>({ label, options, value, onChange, disabled }: SegmentedControlProps<T>): React.ReactElement {
    return <div className='gempba-segmented' role='radiogroup' aria-label={label}>
        {options.map(option => <button key={option.value} type='button' role='radio' className='gempba-segmented-option'
            aria-checked={option.value === value} title={option.title} disabled={disabled}
            onClick={() => option.value !== value && onChange(option.value)}>
            {option.label}
        </button>)}
    </div>;
}

export interface EmptyStateAction {
    readonly label: string;
    readonly run: () => void;
    readonly primary?: boolean;
}

export interface EmptyStateProps {
    /** A codicon name, such as `plug`. */
    readonly icon: string;
    readonly title: string;
    readonly message?: string;
    readonly actions?: readonly EmptyStateAction[];
}

/** What a view shows with nothing to show yet: an icon, what is missing, and the actions that bring it. */
export function EmptyState({ icon, title, message, actions }: EmptyStateProps): React.ReactElement {
    return <div className='gempba-empty'>
        <span className={`gempba-empty-icon codicon codicon-${icon}`} aria-hidden={true} />
        <h2 className='gempba-empty-title'>{title}</h2>
        {message && <p className='gempba-empty-message'>{message}</p>}
        {actions && actions.length > 0 && <div className='gempba-empty-actions'>
            {actions.map(action => <button key={action.label} type='button' className={action.primary ? 'theia-button' : 'theia-button secondary'}
                onClick={action.run}>{action.label}</button>)}
        </div>}
    </div>;
}
