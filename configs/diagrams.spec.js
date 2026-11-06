const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const { files, OUT } = require('./diagrams');

describe('diagrams', () => {

    const drawn = files();

    it('match the files in docs/diagrams: run `npm run diagrams` after changing one', () => {
        const committed = fs.readdirSync(OUT).filter(name => name.endsWith('.svg'));
        expect(committed.sort()).to.deep.equal(Object.keys(drawn).sort());
        for (const [name, svg] of Object.entries(drawn)) {
            expect(fs.readFileSync(path.join(OUT, name), 'utf-8').replace(/\r\n/g, '\n'), name).to.equal(svg);
        }
    });

    it('keeps every box and label inside its canvas', () => {
        for (const [name, svg] of Object.entries(drawn)) {
            const [, width, height] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
            for (const [rect] of svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/g)) {
                const [x, y, w, h] = rect.match(/[\d.-]+/g).map(Number);
                expect(x >= 0 && y >= 0 && x + w <= width && y + h <= height, `${name}: ${rect}`).to.be.true;
            }
        }
    });
});
