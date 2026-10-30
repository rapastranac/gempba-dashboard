import { expect } from 'chai';
import { Contrast } from './contrast';

describe('Contrast', () => {

    it('spans 1 for the same color to 21 for black on white, whichever is the background', () => {
        expect(Contrast.ratio('#123456', '#123456')).to.equal(1);
        expect(Contrast.ratio('#000000', '#ffffff')).to.equal(21);
        expect(Contrast.ratio('#ffffff', '#000000')).to.equal(21);
    });

    it('matches WCAG\'s reference values', () => {
        expect(Contrast.ratio('#777777', '#ffffff')).to.be.closeTo(4.48, 0.01);
        expect(Contrast.ratio('#767676', '#ffffff')).to.be.closeTo(4.54, 0.01);
    });

    it('refuses colors that are not opaque #rrggbb', () => {
        expect(() => Contrast.luminance('#119cae66')).to.throw('Not an opaque #rrggbb color');
        expect(() => Contrast.luminance('teal')).to.throw('Not an opaque #rrggbb color');
    });
});
