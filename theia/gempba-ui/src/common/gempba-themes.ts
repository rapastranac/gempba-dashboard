import dark from './themes/gempba-dark.json';
import light from './themes/gempba-light.json';

/** A color theme in VS Code's format, as the dashboard ships it. */
export interface GemPbaTheme {
    readonly id: string;
    readonly label: string;
    /** The Monaco base theme it builds on: `vs` for light, `vs-dark` for dark. */
    readonly uiTheme: 'vs' | 'vs-dark';
    readonly json: { readonly name: string; readonly type: string; readonly colors: Readonly<Record<string, string>> };
}

/**
 * GemPBA Dark and GemPBA Light: the dashboard's default color themes, in the logo's teal and greens. They set the
 * workbench colors, the chart hues and every gempba.* color; hex values live only in their JSON files. Any other
 * theme still restyles the dashboard through the gempba.* colors' defaults.
 */
export namespace GemPbaThemes {
    export const DARK: GemPbaTheme = { id: 'gempba-dark', label: 'GemPBA Dark', uiTheme: 'vs-dark', json: dark };
    export const LIGHT: GemPbaTheme = { id: 'gempba-light', label: 'GemPBA Light', uiTheme: 'vs', json: light };
    export const ALL: readonly GemPbaTheme[] = [DARK, LIGHT];
}
