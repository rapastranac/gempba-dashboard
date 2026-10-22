import * as React from '@theia/core/shared/react';
import { SparklineGeometry } from '../common/sparkline-geometry';

/** Which theme color a chart uses; each maps to a gempba.chart.* token. */
export type ChartTone = 'cpu' | 'memory';

const VIEW_WIDTH = 100;
const VIEW_HEIGHT = 40;

export interface SparklineProps {
    /** Samples, oldest first. */
    readonly values: readonly number[];
    /** The top of the scale, e.g. 100 for a percentage. */
    readonly max: number;
    /** How many samples a full graph shows; fewer fill in from the right. */
    readonly capacity: number;
    readonly tone: ChartTone;
    readonly label: string;
}

/** A filled area graph that stretches to its container, like a Task Manager history graph. */
export function Sparkline({ values, max, capacity, tone, label }: SparklineProps): React.ReactElement {
    const { line, area } = SparklineGeometry.of(values, { max, capacity, width: VIEW_WIDTH, height: VIEW_HEIGHT });
    return <svg className={`gempba-sparkline gempba-tone-${tone}`} viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} preserveAspectRatio='none' role='img' aria-label={label}>
        <line className='gempba-sparkline-gridline' x1={0} y1={VIEW_HEIGHT / 2} x2={VIEW_WIDTH} y2={VIEW_HEIGHT / 2} vectorEffect='non-scaling-stroke' />
        {area && <path className='gempba-sparkline-area' d={area} />}
        {line && <polyline className='gempba-sparkline-line' points={line} vectorEffect='non-scaling-stroke' />}
    </svg>;
}

export interface MeterBarProps {
    /** How full, from 0 to 1. */
    readonly fraction: number;
    readonly tone: ChartTone;
    readonly label: string;
}

/** A thin horizontal gauge. */
export function MeterBar({ fraction, tone, label }: MeterBarProps): React.ReactElement {
    const percent = Math.round(Math.min(Math.max(fraction, 0), 1) * 1000) / 10;
    return <div className={`gempba-meter gempba-tone-${tone}`} role='meter' aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <div className='gempba-meter-fill' style={{ width: `${percent}%` }} />
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
