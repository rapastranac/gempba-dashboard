/**
 * Number rendering that matches Java's `String.format`: `%.Nf` rounds the shortest decimal
 * representation half-up (so 1.005 → "1.01", unlike `toFixed`), and `%,d` groups with commas
 * regardless of the system locale.
 */
export namespace NumberText {

    export function fixed(value: number, digits: number): string {
        if (!Number.isFinite(value)) {
            return String(value);
        }
        const magnitude = Math.abs(value);
        const repr = String(magnitude);
        const shifted = repr.includes('e')
            ? Math.round(magnitude * 10 ** digits)
            : Math.round(Number(`${repr}e${digits}`));
        const text = (shifted / 10 ** digits).toFixed(digits);
        return value < 0 ? `-${text}` : text;
    }

    export function grouped(value: number): string {
        return fixed(value, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
}
