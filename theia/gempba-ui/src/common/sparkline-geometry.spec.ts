import { expect } from 'chai';
import { SparklineGeometry } from './sparkline-geometry';

describe('SparklineGeometry', () => {

    const box = { max: 100, capacity: 5, width: 100, height: 50 };

    it('draws nothing without samples', () => {
        expect(SparklineGeometry.of([], box)).to.deep.equal({ line: '', area: '' });
    });

    it('spreads a full window across the width, newest at the right', () => {
        expect(SparklineGeometry.of([0, 25, 50, 75, 100], box).line).to.equal('0,50 25,37.5 50,25 75,12.5 100,0');
    });

    it('fills a partial window in from the right edge', () => {
        expect(SparklineGeometry.of([50, 100], box).line).to.equal('75,25 100,0');
    });

    it('keeps only the latest window and clamps values to the scale', () => {
        const values = [10, 20, -5, 30, 40, 150];
        expect(SparklineGeometry.of(values, box).line).to.equal('0,40 25,50 50,35 75,30 100,0');
    });

    it('closes the area down to the baseline', () => {
        expect(SparklineGeometry.of([50, 100], box).area).to.equal('M75,50 L75,25 L100,0 L100,50 Z');
    });

    it('draws a single sample at the right edge', () => {
        expect(SparklineGeometry.of([40], { ...box, capacity: 1 }).line).to.equal('100,30');
    });
});
