import * as React from '@theia/core/shared/react';
import { NiceScale } from '../common/nice-scale';
import { SparklineGeometry } from '../common/sparkline-geometry';

/** Which theme color a chart uses; each maps to a gempba.chart.* token. */
export type ChartTone = 'cpu' | 'memory' | 'tasks' | 'network' | 'idle';

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;

export interface SparklineProps {
    /** Samples, oldest first. */
    readonly values: readonly number[];
    /** The top of the scale, e.g. 100 for a percentage; by default a round number above the largest sample. */
    readonly max?: number;
    /** How many samples a full graph shows; fewer fill in from the right. */
    readonly capacity: number;
    readonly tone: ChartTone;
    readonly label: string;
}

/**
 * A history graph that stretches to its container, like a Task Manager graph: a line over an area fading towards the
 * baseline, and a dot on the newest sample.
 */
export function Sparkline({ values, max, capacity, tone, label }: SparklineProps): React.ReactElement {
    const gradient = `gempba-sparkline-fill-${React.useId().replace(/[^\w-]/g, '')}`;
    const { line, area, last } = SparklineGeometry.of(values, { max: max ?? NiceScale.max(values), capacity, width: VIEW_WIDTH, height: VIEW_HEIGHT });
    return <svg className={`gempba-sparkline gempba-tone-${tone}`} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio='none' role='img' aria-label={label}>
        <defs>
            <linearGradient id={gradient} x1={0} y1={0} x2={0} y2={1}>
                <stop className='gempba-sparkline-fill-top' offset={0} />
                <stop className='gempba-sparkline-fill-bottom' offset={1} />
            </linearGradient>
        </defs>
        <line className='gempba-sparkline-gridline' x1={0} y1={VIEW_HEIGHT / 2} x2={VIEW_WIDTH} y2={VIEW_HEIGHT / 2} vectorEffect='non-scaling-stroke' />
        {area && <path className='gempba-sparkline-area' d={area} fill={`url(#${gradient})`} />}
        {line && <polyline className='gempba-sparkline-line' points={line} vectorEffect='non-scaling-stroke' />}
        {/* a zero-length line with a round cap: a dot that keeps its size however the graph stretches */}
        {last && <line className='gempba-sparkline-dot' x1={last.x} y1={last.y} x2={last.x} y2={last.y} vectorEffect='non-scaling-stroke' />}
    </svg>;
}

export interface MeterBarProps {
    /** How full, from 0 to 1. */
    readonly fraction: number;
    readonly tone: ChartTone;
    readonly label: string;
}

/** A thin horizontal gauge, whose fill slides to each new value. */
export function MeterBar({ fraction, tone, label }: MeterBarProps): React.ReactElement {
    const filled = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
    return <div className={`gempba-meter gempba-tone-${tone}`} role='meter' aria-label={label} aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={Math.round(filled * 1000) / 10}>
        <div className='gempba-meter-fill' style={{ transform: `scaleX(${Math.round(filled * 1000) / 1000})` }} />
    </div>;
}

export interface TileProps {
    readonly title: string;
    /** The headline figure at the top right, e.g. a CPU percentage. */
    readonly readout?: string;
    readonly tooltip?: string;
    readonly selected?: boolean;
    readonly onSelect?: () => void;
    /** Opens what the tile stands for: on double-click, or on Enter, which also selects it. */
    readonly onOpen?: () => void;
    readonly children?: React.ReactNode;
}

/** A selectable card with a title row; what it shows is up to its children. A click selects it, a double-click opens it. */
export function Tile({ title, readout, tooltip, selected, onSelect, onOpen, children }: TileProps): React.ReactElement {
    const onKeyDown = (event: React.KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        onSelect?.();
        if (event.key === 'Enter') {
            onOpen?.();
        }
    };
    return <div className={'gempba-tile' + (selected ? ' gempba-tile-selected' : '')} title={tooltip} role='button' tabIndex={0}
        aria-pressed={selected === true} onClick={onSelect} onDoubleClick={onOpen} onKeyDown={onKeyDown}>
        <div className='gempba-tile-header'>
            <span className='gempba-tile-title'>{title}</span>
            {readout && <span className='gempba-tile-readout'>{readout}</span>}
        </div>
        {children}
    </div>;
}

/** Lays tiles out in as many columns as fit, wrapping as the view is resized. */
export function TileGrid({ children }: { readonly children?: React.ReactNode }): React.ReactElement {
    return <div className='gempba-tile-grid'>{children}</div>;
}

export interface PropertySection {
    readonly title: string;
    readonly rows: ReadonlyArray<{ readonly label: string; readonly value: React.ReactNode }>;
}

/** Label and value rows under section headings, like a properties view. */
export function PropertySheet({ sections }: { readonly sections: readonly PropertySection[] }): React.ReactElement {
    return <table className='gempba-property-sheet'>
        {sections.map(section => <tbody key={section.title}>
            <tr>
                <th className='gempba-property-section' colSpan={2} scope='colgroup'>{section.title}</th>
            </tr>
            {section.rows.map(row => <tr key={row.label}>
                <th className='gempba-property-label' scope='row'>{row.label}</th>
                <td className='gempba-property-value'>{row.value}</td>
            </tr>)}
        </tbody>)}
    </table>;
}

export interface DataColumn {
    readonly label: string;
    /** `end` for numbers, so their digits line up. */
    readonly align?: 'start' | 'end';
}

/** A plain table with a header row; each row holds one text per column. */
export function DataTable({ columns, rows }: { readonly columns: readonly DataColumn[]; readonly rows: ReadonlyArray<readonly string[]> }): React.ReactElement {
    const align = (index: number) => columns[index]?.align === 'end' ? 'gempba-data-end' : undefined;
    return <table className='gempba-data-table'>
        <thead>
            <tr>{columns.map((column, index) => <th key={column.label} className={align(index)} scope='col'>{column.label}</th>)}</tr>
        </thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className={align(index)}>{cell}</td>)}</tr>)}</tbody>
    </table>;
}
