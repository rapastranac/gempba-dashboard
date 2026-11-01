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
    export const CHART_TASKS = 'gempba.chart.tasks';
    export const CHART_NETWORK = 'gempba.chart.network';
    export const CHART_IDLE = 'gempba.chart.idle';
    export const PANEL_BACKGROUND = 'gempba.panel.background';
    export const PANEL_BORDER = 'gempba.panel.border';
    export const PANEL_TITLE_FOREGROUND = 'gempba.panel.titleForeground';
    export const HERO_FOREGROUND = 'gempba.hero.foreground';
    export const GAUGE_TRACK = 'gempba.gauge.track';
    export const HEAT_LOW = 'gempba.heat.low';
    export const HEAT_HIGH = 'gempba.heat.high';
    export const LIVE_ACTIVE = 'gempba.live.active';
    export const LIVE_STALE = 'gempba.live.stale';
    export const LIVE_OFF = 'gempba.live.off';

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
        [CHART_GRID, 'charts.lines', 'Chart grid lines and meter tracks.'],
        [CHART_TASKS, 'charts.green', 'Task throughput graphs.'],
        [CHART_NETWORK, 'charts.orange', 'Network traffic graphs.'],
        [CHART_IDLE, 'charts.yellow', 'Idle time graphs.'],
        [PANEL_BACKGROUND, 'editorWidget.background', 'Background of a GemPBA panel.'],
        [PANEL_BORDER, 'editorWidget.border', 'Border of a GemPBA panel.'],
        [PANEL_TITLE_FOREGROUND, 'descriptionForeground', 'Title of a GemPBA panel.'],
        [HERO_FOREGROUND, 'foreground', 'Headline figures.'],
        [GAUGE_TRACK, 'charts.lines', 'The unfilled part of a gauge.'],
        [HEAT_LOW, 'charts.lines', 'An idle CPU in a heat strip; busier CPUs mix towards the high color.'],
        [HEAT_HIGH, 'charts.red', 'A fully busy CPU in a heat strip.'],
        [LIVE_ACTIVE, 'charts.green', 'The live indicator while frames arrive.'],
        [LIVE_STALE, 'charts.yellow', 'The live indicator while frames are late, and a rate gempba did not take.'],
        [LIVE_OFF, 'disabledForeground', 'The live indicator while not streaming.']
    ];
}
