/**
 * Which views the dashboard keeps: GemPBA's own, whose ids start with `gempba-`, and the Theia views a
 * ShellContribution lists. An allowlist, so the IDE views Theia's packages bring are dropped, and so are any a
 * later Theia version adds.
 */
export namespace ShellViews {

    export const OWN_PREFIX = 'gempba-';

    export function isShown(viewId: string, shownViews: readonly string[]): boolean {
        return viewId.startsWith(OWN_PREFIX) || shownViews.includes(viewId);
    }
}
