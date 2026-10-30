import { expect } from 'chai';
import { StaleThemes } from './stale-themes';

describe('StaleThemes', () => {

    it('names a plugin theme by its id, else its label, else its file name, as Theia registers it', () => {
        const uri = 'file:///c%3A/plugins/dracula/themes/dracula-soft.json';
        expect(StaleThemes.idOf({ id: 'dracula', label: 'Dracula Theme', uri })).to.equal('dracula');
        expect(StaleThemes.idOf({ label: 'Dracula Theme', uri })).to.equal('Dracula Theme');
        expect(StaleThemes.idOf({ uri })).to.equal('dracula-soft.json');
    });

    it('finds the cached themes that nothing registered again and no installed plugin declares', () => {
        const cached = ['gempba-dark', 'Dracula Theme', 'Dracula Theme Soft', 'One Dark Pro'];
        expect(StaleThemes.of(cached, new Set(['gempba-dark']), new Set(['One Dark Pro']))).to.deep.equal(['Dracula Theme', 'Dracula Theme Soft']);
    });

    it('finds nothing stale when every cached theme is still provided', () => {
        expect(StaleThemes.of(['gempba-dark', 'Dracula Theme'], new Set(['gempba-dark']), new Set(['Dracula Theme']))).to.deep.equal([]);
        expect(StaleThemes.of([], new Set(), new Set())).to.deep.equal([]);
    });
});
