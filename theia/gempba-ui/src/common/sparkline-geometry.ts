/**
 * The shape of a sparkline in a `width × height` box: samples oldest first, the newest at the right edge, one
 * slot per sample of a full window, like a Task Manager graph filling in from the right. Values are clamped to
 * `0..max`. Pure, so the drawing stays testable and any renderer can use it.
 */
export interface SparklineGeometry {
    /** The polyline through the samples (an SVG `points` value); empty without samples. */
    readonly line: string;
    /** The closed area under the line (an SVG path); empty without samples. */
    readonly area: string;
    /** Where the newest sample is drawn; absent without samples. */
    readonly last?: { readonly x: number, readonly y: number };
}

export namespace SparklineGeometry {

    export function of(values: readonly number[], options: { max: number, capacity: number, width: number, height: number }): SparklineGeometry {
        const { max, width, height } = options;
        const shown = values.slice(-Math.max(options.capacity, 1));
        if (shown.length === 0 || max <= 0) {
            return { line: '', area: '' };
        }
        const capacity = Math.max(options.capacity, shown.length);
        const step = capacity > 1 ? width / (capacity - 1) : 0;
        const firstX = width - step * (shown.length - 1);
        const points = shown.map((value, index) => {
            const clamped = Math.min(Math.max(value, 0), max);
            return [round(firstX + step * index), round(height - clamped / max * height)] as const;
        });
        const line = points.map(([x, y]) => `${x},${y}`).join(' ');
        const area = `M${points[0][0]},${height} ` + points.map(([x, y]) => `L${x},${y}`).join(' ') + ` L${points[points.length - 1][0]},${height} Z`;
        const [lastX, lastY] = points[points.length - 1];
        return { line, area, last: { x: lastX, y: lastY } };
    }
}

function round(value: number): number {
    return Math.round(value * 100) / 100;
}
