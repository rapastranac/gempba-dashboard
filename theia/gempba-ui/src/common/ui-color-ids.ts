/**
 * The gempba.* theme colors. Each one defaults to a standard theme color, never a literal, so the components
 * follow whichever theme is active (including VS Code themes from plugins), and a theme can still restyle them
 * by id. Components use them only as `var(--theia-gempba-…)`.
 */
export namespace UiColors {
    export const TILE_BACKGROUND = 'gempba.tile.background';
    export const TILE_BORDER = 'gempba.tile.border';
    export const TILE_HOVER_BORDER = 'gempba.tile.hoverBorder';
    export const TILE_SELECTED_BORDER = 'gempba.tile.selectedBorder';
    export const TILE_FOREGROUND = 'gempba.tile.foreground';
    export const TILE_SECONDARY_FOREGROUND = 'gempba.tile.secondaryForeground';
    export const CHART_CPU = 'gempba.chart.cpu';
    export const CHART_MEMORY = 'gempba.chart.memory';
    export const CHART_GRID = 'gempba.chart.grid';

    /** Each gempba color and the standard theme color it follows by default. */
    export const DEFAULTS: ReadonlyArray<readonly [id: string, follows: string, description: string]> = [
        [TILE_BACKGROUND, 'editorWidget.background', 'Background of a GemPBA tile.'],
        [TILE_BORDER, 'editorWidget.border', 'Border of a GemPBA tile.'],
        [TILE_HOVER_BORDER, 'focusBorder', 'Border of a GemPBA tile under the mouse.'],
        [TILE_SELECTED_BORDER, 'focusBorder', 'Border of the selected GemPBA tile.'],
        [TILE_FOREGROUND, 'foreground', 'Main text of a GemPBA tile.'],
        [TILE_SECONDARY_FOREGROUND, 'descriptionForeground', 'Secondary text of a GemPBA tile.'],
        [CHART_CPU, 'charts.blue', 'CPU graphs and meters.'],
        [CHART_MEMORY, 'charts.purple', 'Memory graphs and meters.'],
        [CHART_GRID, 'charts.lines', 'Chart grid lines and meter tracks.']
    ];
}
