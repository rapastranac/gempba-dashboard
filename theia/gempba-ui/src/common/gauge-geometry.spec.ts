import { expect } from 'chai';
import { GaugeGeometry } from './gauge-geometry';

const BOX = { size: 100, thickness: 10 };

describe('GaugeGeometry', () => {

    it('draws three quarters of a circle, open at the bottom', () => {
        // radius 45 around (50, 50): from 135° (bottom-left) clockwise to 45° (bottom-right)
        expect(GaugeGeometry.of(0.5, BOX).path).to.equal('M18.18,81.82 A45,45 0 1 1 81.82,81.82');
    });

    it('is as long as three quarters of the circle', () => {
        expect(GaugeGeometry.of(0, BOX).length).to.equal(Math.round(2 * Math.PI * 45 * 0.75 * 100) / 100);
    });

    it('leaves the unfilled share of the arc unstroked', () => {
        const { length } = GaugeGeometry.of(0, BOX);
        expect(GaugeGeometry.of(0, BOX).offset).to.equal(length);
        expect(GaugeGeometry.of(1, BOX).offset).to.equal(0);
        expect(GaugeGeometry.of(0.25, BOX).offset).to.be.closeTo(length * 0.75, 0.01);
    });

    it('clamps the fraction, and draws nothing for one that is not a number', () => {
        const { length } = GaugeGeometry.of(0, BOX);
        expect(GaugeGeometry.of(1.7, BOX).offset).to.equal(0);
        expect(GaugeGeometry.of(-0.2, BOX).offset).to.equal(length);
        expect(GaugeGeometry.of(Number.NaN, BOX).offset).to.equal(length);
    });

    it('keeps the stroke inside the box', () => {
        expect(GaugeGeometry.of(1, { size: 40, thickness: 8 }).path).to.equal('M8.69,31.31 A16,16 0 1 1 31.31,31.31');
    });
});
