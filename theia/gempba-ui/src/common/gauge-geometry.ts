/**
 * The shape of a gauge in a `size × size` box: an arc open at the bottom, like a speedometer, as one SVG path. The
 * value is the same path stroked up to a fraction of its length (`stroke-dasharray: length`, `stroke-dashoffset:
 * offset`), so a change of value animates through the offset alone.
 */
export interface GaugeGeometry {
    /** The arc (an SVG path), clockwise from its bottom-left end to its bottom-right end. */
    readonly path: string;
    /** The arc's length. */
    readonly length: number;
    /** How much of the arc's length stays unstroked: all of it when empty, none when full. */
    readonly offset: number;
}

export namespace GaugeGeometry {

    /** Degrees the arc spans: three quarters of a circle. */
    export const SWEEP = 270;

    export function of(fraction: number, options: { size: number, thickness: number }): GaugeGeometry {
        const center = options.size / 2;
        const radius = (options.size - options.thickness) / 2;
        // SVG angles grow clockwise from the right, as y points down: 135° is the bottom-left end
        const start = 90 + (360 - SWEEP) / 2;
        const [x1, y1] = pointAt(center, radius, start);
        const [x2, y2] = pointAt(center, radius, start + SWEEP);
        const path = `M${round(x1)},${round(y1)} A${round(radius)},${round(radius)} 0 ${SWEEP > 180 ? 1 : 0} 1 ${round(x2)},${round(y2)}`;
        const length = round(2 * Math.PI * radius * SWEEP / 360);
        const filled = Number.isFinite(fraction) ? Math.min(Math.max(fraction, 0), 1) : 0;
        return { path, length, offset: round(length * (1 - filled)) };
    }
}

function pointAt(center: number, radius: number, degrees: number): [number, number] {
    const radians = degrees * Math.PI / 180;
    return [center + radius * Math.cos(radians), center + radius * Math.sin(radians)];
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
