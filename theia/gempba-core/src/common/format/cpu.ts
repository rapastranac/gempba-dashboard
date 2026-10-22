import { NumberText } from './number-text';

export namespace Cpu {

    /** `[0,1,2,3,4]` → `CPUs 0–4`; `[0,2,4]` → `CPUs 0, 2, 4`; `[0,1,2,5,6,7]` → `CPUs 0–2, 5–7`; empty → `""`. */
    export function range(ids: readonly number[] | undefined): string {
        if (!ids || ids.length === 0) {
            return '';
        }
        const chunks: string[] = [];
        let runStart = ids[0];
        let previous = runStart;
        for (let i = 1; i <= ids.length; i++) {
            const current = i < ids.length ? ids[i] : Number.NaN;
            if (current === previous + 1) {
                previous = current;
                continue;
            }
            chunks.push(runStart === previous ? `${runStart}` : `${runStart}–${previous}`);
            runStart = current;
            previous = current;
        }
        return `CPUs ${chunks.join(', ')}`;
    }

    /** How a worker uses a socket's cores, e.g. `87.3 % CPU · can use 4 of 8 cores · currently using ≈ 0.87 cores`. */
    export function coreUsage(cpuPct: number, accessibleHere: number, socketCores: number): string {
        const access = accessibleHere === socketCores
            ? `can use all ${socketCores} cores`
            : `can use ${accessibleHere} of ${socketCores} cores`;
        const usage = `currently using ≈ ${effectiveCores(cpuPct / 100, accessibleHere)}`;
        return `${NumberText.fixed(cpuPct, 1)} % CPU · ${access} · ${usage}`;
    }

    /** `idle`, `0.87 cores`, `1.4 core`, `2.1 cores`, or `9.1 cores (oversubscribed)`. */
    export function effectiveCores(effective: number, accessible: number): string {
        if (effective < 0.05) {
            return 'idle';
        }
        const number = effective < 1 ? NumberText.fixed(effective, 2) : NumberText.fixed(effective, 1);
        if (effective > accessible + 0.5) {
            return `${number} cores (oversubscribed)`;
        }
        return `${number} core${effective >= 1 && effective < 1.5 ? '' : 's'}`;
    }
}
