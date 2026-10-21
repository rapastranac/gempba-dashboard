export function positiveOr(value: number | undefined, fallback: number): number {
    return value !== undefined && value > 0 ? value : fallback;
}

export function isBlank(value: string | undefined): boolean {
    return value === undefined || value.trim().length === 0;
}
