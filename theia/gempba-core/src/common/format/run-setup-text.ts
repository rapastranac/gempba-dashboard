import { RunSetup } from '../model/run-setup';
import { Durations } from './durations';

/** gempba's names for its schedulers and load balancers, as the views say them; any other name shows as sent. */
const NAMES: Readonly<Record<string, string>> = {
    centralized: 'centralized',
    semi_centralized: 'semi-centralized',
    decentralized: 'decentralized',
    quasi_horizontal: 'quasi-horizontal',
    work_stealing: 'work stealing'
};

/** How a run is set up, in words: one line for the Grid's overview and the status bar, and the details for a tooltip. */
export namespace RunSetupText {

    /** `Semi-centralized · quasi-horizontal · 4 ranks · 8 threads · gempba 4.3.0`; what the run doesn't report is left out. */
    export function line(run: RunSetup): string {
        const parts = [
            ...(run.scheduler ? [name(run.scheduler)] : []),
            ...(run.loadBalancer ? [name(run.loadBalancer)] : []),
            plural(run.worldSize, 'rank'),
            ...(run.threadsPerProcess > 0 ? [plural(run.threadsPerProcess, 'thread')] : []),
            ...(run.gempbaVersion ? [`gempba ${run.gempbaVersion}`] : [])
        ];
        const text = parts.join(' · ');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    /**
     * The annotations the program set, `key: value` in the order it set them, then the markers, `phase 2 at 4.0 s, from a
     * dashboard`; empty when the run has neither.
     */
    export function details(run: RunSetup): string[] {
        return [
            ...run.annotations.map(([key, value]) => `${key}: ${value}`),
            ...run.markers.map(marker => `${marker.label} at ${Durations.format(marker.elapsedMs * 1000)}, ${source(marker.source)}`)
        ];
    }

    function name(sent: string): string {
        return NAMES[sent] ?? sent;
    }

    function source(sent: string): string {
        switch (sent) {
            case 'code':
                return 'from the program';
            case 'dashboard':
                return 'from a dashboard';
            default:
                return `from ${sent}`;
        }
    }

    function plural(count: number, noun: string): string {
        return `${count} ${noun}${count === 1 ? '' : 's'}`;
    }
}
