import { expect } from 'chai';
import { Contrast } from './contrast';
import { GemPbaThemes } from './gempba-themes';
import { UiColors } from './ui-color-ids';

/** Text on its background: at least 4.5:1. */
const TEXT: ReadonlyArray<readonly [foreground: string, background: string]> = [
    ['foreground', 'editor.background'],
    ['descriptionForeground', 'editor.background'],
    ['sideBar.foreground', 'sideBar.background'],
    ['descriptionForeground', 'sideBar.background'],
    ['tab.activeForeground', 'tab.activeBackground'],
    ['tab.inactiveForeground', 'tab.inactiveBackground'],
    ['titleBar.activeForeground', 'titleBar.activeBackground'],
    ['menu.foreground', 'menu.background'],
    ['menu.selectionForeground', 'menu.selectionBackground'],
    ['statusBar.foreground', 'statusBar.background'],
    ['statusBar.noFolderForeground', 'statusBar.noFolderBackground'],
    ['input.foreground', 'input.background'],
    ['button.foreground', 'button.background'],
    ['button.secondaryForeground', 'button.secondaryBackground'],
    ['secondaryButton.foreground', 'secondaryButton.background'],
    ['list.activeSelectionForeground', 'list.activeSelectionBackground'],
    ['quickInput.foreground', 'quickInput.background'],
    ['quickInputList.focusForeground', 'quickInputList.focusBackground'],
    ['notifications.foreground', 'notifications.background'],
    ['badge.foreground', 'badge.background'],
    ['activityBarBadge.foreground', 'activityBarBadge.background'],
    ['extensionButton.prominentForeground', 'extensionButton.prominentBackground'],
    [UiColors.TILE_FOREGROUND, UiColors.TILE_BACKGROUND],
    [UiColors.TILE_SECONDARY_FOREGROUND, UiColors.TILE_BACKGROUND]
];

/** Chart lines and fills on the tile they are drawn in: at least 3:1. */
const GRAPHICS: ReadonlyArray<readonly [foreground: string, background: string]> = [
    [UiColors.CHART_CPU, UiColors.TILE_BACKGROUND],
    [UiColors.CHART_MEMORY, UiColors.TILE_BACKGROUND],
    ...['charts.blue', 'charts.green', 'charts.purple', 'charts.orange', 'charts.yellow', 'charts.red']
        .map(chart => [chart, UiColors.TILE_BACKGROUND] as const)
];

describe('GemPbaThemes', () => {

    for (const theme of GemPbaThemes.ALL) {
        const colors = theme.json.colors;
        const color = (id: string) => {
            expect(colors[id], `${theme.label} sets ${id}`).to.be.a('string');
            return colors[id];
        };

        describe(theme.label, () => {

            it('is named and typed for its Monaco base theme', () => {
                expect(theme.json.name).to.equal(theme.label);
                expect(theme.json.type).to.equal(theme.uiTheme === 'vs' ? 'light' : 'dark');
            });

            it('sets every gempba.* color', () => {
                const missing = UiColors.DEFAULTS.map(([id]) => id).filter(id => colors[id] === undefined);
                expect(missing).to.deep.equal([]);
            });

            it('writes every color as #rrggbb or #rrggbbaa', () => {
                const malformed = Object.entries(colors).filter(([, value]) => !/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value));
                expect(malformed).to.deep.equal([]);
            });

            it('keeps text readable: at least 4.5:1 on its background', () => {
                const low = TEXT.map(([foreground, background]) => [foreground, background, Contrast.ratio(color(foreground), color(background))] as const)
                    .filter(([, , ratio]) => ratio < 4.5);
                expect(low).to.deep.equal([]);
            });

            it('keeps charts visible: at least 3:1 on the tiles', () => {
                const low = GRAPHICS.map(([foreground, background]) => [foreground, background, Contrast.ratio(color(foreground), color(background))] as const)
                    .filter(([, , ratio]) => ratio < 3);
                expect(low).to.deep.equal([]);
            });
        });
    }
});
