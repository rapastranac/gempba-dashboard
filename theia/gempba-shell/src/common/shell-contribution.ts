import { Command } from '@theia/core/lib/common/command';

export const ShellContribution = Symbol('ShellContribution');

/** A contribution class, matched with `instanceof` because class names are minified in production builds. */
export type ContributionClass = abstract new (...args: never[]) => object;

/**
 * What a package adds to the shell's trimming of Theia: contributions and commands to remove, and views and settings
 * to keep. The shell lists its own the same way, so a package that brings in more of Theia (such as plugin support)
 * strips what it brings, and dropping that package drops its lists with it.
 */
export interface ShellContribution {
    /** Contributions dropped whole: they only add IDE commands, menus, shortcuts or status-bar items. */
    readonly strippedContributions?: readonly ContributionClass[];
    /** Commands removed with their menu items, palette entries and shortcuts. */
    readonly strippedCommands?: readonly Command[];
    /** Ids of Theia views to keep; GemPBA's own views are always kept (see ShellViews). */
    readonly shownViews?: readonly string[];
    /** Prefixes of settings shown on the Settings page, besides the UI settings (see UiPreferences). */
    readonly shownSettings?: readonly string[];
}
