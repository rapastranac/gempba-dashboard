import * as React from '@theia/core/shared/react';
import { GaugeGeometry } from '../common/gauge-geometry';
import { HeatScale } from '../common/heat-scale';
import { Liveness } from '../common/liveness';
import { RateAgreement } from '../common/rate-agreement';
import { ChartTone } from './components';

export interface GaugeProps {
    /** How full, from 0 to 1. */
    readonly fraction: number;
    readonly tone: ChartTone;
    readonly label: string;
    /** The figure in the middle, already formatted, such as `87%`. */
    readonly valueText: string;
    /** Width and height in pixels. */
    readonly size?: number;
}

const GAUGE_THICKNESS = 8;

/** A speedometer-style gauge, whose arc sweeps to each new value. */
export function Gauge({ fraction, tone, label, valueText, size = 96 }: GaugeProps): React.ReactElement {
    const { path, length, offset } = GaugeGeometry.of(fraction, { size, thickness: GAUGE_THICKNESS });
    const filled = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
    return <div className={`gempba-gauge gempba-tone-${tone}`} style={{ width: size, height: size }} role='meter' aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(filled * 1000) / 10} aria-valuetext={valueText}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden={true}>
            <path className='gempba-gauge-track' d={path} strokeWidth={GAUGE_THICKNESS} />
            <path className='gempba-gauge-value' d={path} strokeWidth={GAUGE_THICKNESS} strokeDasharray={length} strokeDashoffset={offset}
                opacity={filled > 0 ? 1 : 0} />
        </svg>
        <span className='gempba-gauge-text'>{valueText}</span>
    </div>;
}

export interface HeatCell {
    readonly key: string | number;
    /** Percent of one CPU; above 100 is more work than it can run. */
    readonly loadPct: number;
    readonly oversubscribed?: boolean;
    /** What the cell shows, in words, such as `CPU 3: 75%`. */
    readonly title: string;
}

/** One cell per CPU, shaded from idle to busy with the heat theme colors; an oversubscribed CPU is outlined. */
export function HeatStrip({ cells, label }: { readonly cells: readonly HeatCell[], readonly label: string }): React.ReactElement {
    return <div className='gempba-heat-strip' role='img' aria-label={label}>
        {cells.map(cell => <span key={cell.key} className={cell.oversubscribed ? 'gempba-heat-cell gempba-heat-over' : 'gempba-heat-cell'} title={cell.title}
            style={{ '--gempba-heat-mix': HeatScale.mix(HeatScale.step(cell.loadPct)) } as React.CSSProperties} />)}
    </div>;
}

/** A dot and a word for whether frames are arriving: live (the dot pulses), waiting, or not streaming. */
export interface LiveIndicatorProps {
    readonly liveness: Liveness;
    /** The words for the state; its usual words by default. */
    readonly label?: string;
    /** Only the dot, still steady while live, its words in its tooltip: for one of many, as on every tile. */
    readonly compact?: boolean;
}

export function LiveIndicator({ liveness, label, compact }: LiveIndicatorProps): React.ReactElement {
    const words = label ?? Liveness.label(liveness);
    if (compact) {
        return <span className={`gempba-live gempba-live-${liveness} gempba-live-compact`} role='img' aria-label={words} title={words}>
            <span className='gempba-live-dot' aria-hidden={true} />
        </span>;
    }
    return <span className={`gempba-live gempba-live-${liveness}`} role='status'>
        <span className='gempba-live-dot' aria-hidden={true} />
        {words}
    </span>;
}

export interface RateReadoutProps {
    /** The interval set, in milliseconds. */
    readonly setMs: number;
    /** The interval frames actually arrive at; unknown until measured. */
    readonly observedMs?: number;
    /** Words for an interval, such as `500 ms`. */
    readonly format: (ms: number) => string;
}

/** A refresh rate as set, and how often frames actually arrive, marked when the two differ, as when gempba did not take it. */
export function RateReadout({ setMs, observedMs, format }: RateReadoutProps): React.ReactElement {
    const agreement = RateAgreement.of(setMs, observedMs);
    const title = agreement === 'differs' ? 'Frames do not arrive at the rate set: gempba may have clamped or ignored it' : undefined;
    return <span className={`gempba-rate gempba-rate-${agreement}`} title={title}>
        {format(setMs)}
        {observedMs !== undefined && <span className='gempba-rate-observed'>{`arriving every ${format(observedMs)}`}</span>}
    </span>;
}
