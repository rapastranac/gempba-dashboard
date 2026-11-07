import { expect } from 'chai';
import { ShellViews } from './shell-views';

describe('ShellViews', () => {

    it('keeps GemPBA\'s own views', () => {
        for (const id of ['gempba-grid', 'gempba-cards', 'gempba-connection']) {
            expect(ShellViews.isShown(id, []), id).to.equal(true);
        }
    });

    it('keeps the Theia views a contribution lists, and only those', () => {
        expect(ShellViews.isShown('settings_widget', ['settings_widget'])).to.equal(true);
        for (const id of ['settings_widget', 'outline-view', 'problems', 'explorer-view-container', 'gempba']) {
            expect(ShellViews.isShown(id, []), id).to.equal(false);
        }
    });
});
