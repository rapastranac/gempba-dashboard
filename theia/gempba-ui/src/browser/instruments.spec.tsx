import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { renderToStaticMarkup } from '@theia/core/shared/react-dom/server';
import { GaugeGeometry } from '../common/gauge-geometry';
import { Gauge, HeatStrip, LiveIndicator, RateReadout } from './instruments';

describe('Gauge', () => {

    it('is a meter whose arc is stroked up to the value', () => {
        const html = renderToStaticMarkup(<Gauge fraction={0.25} tone='cpu' label='CPU' valueText='25%' size={100} />);
        const { path, length, offset } = GaugeGeometry.of(0.25, { size: 100, thickness: 8 });
        expect(html).to.contain('role="meter" aria-label="CPU" aria-valuemin="0" aria-valuemax="100" aria-valuenow="25" aria-valuetext="25%"');
        expect(html).to.contain(`class="gempba-gauge-value" d="${path}" stroke-width="8" stroke-dasharray="${length}" stroke-dashoffset="${offset}" opacity="1"`);
        expect(html).to.contain('<span class="gempba-gauge-text">25%</span>');
        expect(html).to.contain('gempba-tone-cpu');
    });

    it('hides the value arc while empty, so its round cap leaves no dot', () => {
        expect(renderToStaticMarkup(<Gauge fraction={0} tone='cpu' label='CPU' valueText='0%' />)).to.contain('opacity="0"');
    });
});

describe('HeatStrip', () => {

    it('draws a cell per CPU, mixing in more of the high color the busier it is', () => {
        const html = renderToStaticMarkup(<HeatStrip label='Socket 0' cells={[
            { key: 0, loadPct: 0, title: 'CPU 0: idle' },
            { key: 1, loadPct: 73, title: 'CPU 1: 73%' },
            { key: 2, loadPct: 150, oversubscribed: true, title: 'CPU 2: 150%, oversubscribed' }
        ]} />);
        expect(html).to.contain('<div class="gempba-heat-strip" role="img" aria-label="Socket 0">');
        expect(html.match(/class="gempba-heat-cell/g)).to.have.lengthOf(3);
        expect(html).to.contain('class="gempba-heat-cell" title="CPU 0: idle" style="--gempba-heat-mix:0%"');
        expect(html).to.contain('class="gempba-heat-cell" title="CPU 1: 73%" style="--gempba-heat-mix:70%"');
        expect(html).to.contain('class="gempba-heat-cell gempba-heat-over" title="CPU 2: 150%, oversubscribed" style="--gempba-heat-mix:100%"');
    });
});

describe('LiveIndicator', () => {

    it('shows each state as a dot and a word', () => {
        expect(renderToStaticMarkup(<LiveIndicator liveness='live' />))
            .to.equal('<span class="gempba-live gempba-live-live" role="status"><span class="gempba-live-dot" aria-hidden="true"></span>Live</span>');
        expect(renderToStaticMarkup(<LiveIndicator liveness='stale' />)).to.contain('gempba-live-stale').and.to.contain('Waiting for frames');
        expect(renderToStaticMarkup(<LiveIndicator liveness='off' label='Stopped' />)).to.contain('gempba-live-off').and.to.contain('Stopped');
    });

    it('shows only the dot when compact, its words in its tooltip', () => {
        expect(renderToStaticMarkup(<LiveIndicator liveness='stale' compact={true} />)).to.equal('<span class="gempba-live gempba-live-stale gempba-live-compact" '
            + 'role="img" aria-label="Waiting for frames" title="Waiting for frames"><span class="gempba-live-dot" aria-hidden="true"></span></span>');
    });
});

describe('RateReadout', () => {

    const format = (ms: number) => `${ms} ms`;

    it('shows the rate set, and how often frames arrive once measured', () => {
        expect(renderToStaticMarkup(<RateReadout setMs={500} format={format} />)).to.equal('<span class="gempba-rate gempba-rate-unknown">500 ms</span>');
        expect(renderToStaticMarkup(<RateReadout setMs={500} observedMs={498} format={format} />))
            .to.equal('<span class="gempba-rate gempba-rate-agrees">500 ms<span class="gempba-rate-observed">arriving every 498 ms</span></span>');
    });

    it('marks a rate that frames do not keep, and says why that may be', () => {
        const html = renderToStaticMarkup(<RateReadout setMs={100} observedMs={500} format={format} />);
        expect(html).to.contain('class="gempba-rate gempba-rate-differs" title="Frames do not arrive at the rate set: gempba may have clamped or ignored it"');
    });
});
