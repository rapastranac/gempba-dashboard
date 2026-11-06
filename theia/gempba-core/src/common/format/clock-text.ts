/** How long ago something happened, and when, on this machine's clock. */
export namespace ClockText {

    /** `12 s ago`, `2 min ago`, `3 h ago` or `2 d ago`, whole units rounded down; a moment in the future reads `0 s ago`. */
    export function ago(elapsedMs: number): string {
        const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
        if (seconds < 60) {
            return `${seconds} s ago`;
        }
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) {
            return `${minutes} min ago`;
        }
        const hours = Math.floor(minutes / 60);
        return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
    }

    /** The local time of day, `12:04:31`, the same in every locale. */
    export function time(epochMs: number): string {
        const at = new Date(epochMs);
        return [at.getHours(), at.getMinutes(), at.getSeconds()].map(part => String(part).padStart(2, '0')).join(':');
    }
}
