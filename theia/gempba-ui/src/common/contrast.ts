/** WCAG 2 contrast between two opaque colors written as `#rrggbb`. */
export namespace Contrast {

    /** From 1 (identical) to 21 (black on white); text needs at least 4.5, large text and graphics 3. */
    export function ratio(foreground: string, background: string): number {
        const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
        return (lighter + 0.05) / (darker + 0.05);
    }

    /** Relative luminance, from 0 for black to 1 for white. */
    export function luminance(color: string): number {
        const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
        if (!match) {
            throw new Error(`Not an opaque #rrggbb color: ${color}`);
        }
        const [red, green, blue] = match.slice(1).map(hex => {
            const channel = parseInt(hex, 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    }
}
