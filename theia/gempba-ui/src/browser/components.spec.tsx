import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { renderToStaticMarkup } from '@theia/core/shared/react-dom/server';
import { MeterBar, Sparkline, Tile } from './components';

describe('Sparkline', () => {

    it('fills the area with a gradient of its tone, defined in the graph itself', () => {
        const html = renderToStaticMarkup(<Sparkline values={[10, 20]} max={100} capacity={5} tone='tasks' label='Tasks' />);
        const id = /<linearGradient id="([^"]+)"/.exec(html)?.[1];
        expect(id).to.match(/^gempba-sparkline-fill-[\w-]+$/);
        expect(html).to.contain(`fill="url(#${id})"`);
        expect(html).to.contain('gempba-tone-tasks');
    });

    it('marks the newest sample with a dot', () => {
        const html = renderToStaticMarkup(<Sparkline values={[10, 50]} max={100} capacity={5} tone='cpu' label='CPU' />);
        expect(html).to.match(/<line class="gempba-sparkline-dot" x1="100" y1="20" x2="100" y2="20"/);
    });

    it('scales to a round number above the largest sample when given no maximum', () => {
        // 237 rounds up to 250, so the newest sample, 237, sits 94.8% up a 40-unit-high graph
        const html = renderToStaticMarkup(<Sparkline values={[100, 237]} capacity={2} tone='tasks' label='Tasks' />);
        expect(html).to.contain('points="0,24 100,2.08"');
    });

    it('draws only the grid without samples', () => {
        const html = renderToStaticMarkup(<Sparkline values={[]} max={100} capacity={5} tone='cpu' label='CPU' />);
        expect(html).to.contain('gempba-sparkline-gridline');
        expect(html).not.to.contain('gempba-sparkline-line');
        expect(html).not.to.contain('gempba-sparkline-dot');
    });

    it('gives each graph a gradient of its own', () => {
        const html = renderToStaticMarkup(<>
            <Sparkline values={[1]} max={1} capacity={1} tone='cpu' label='a' />
            <Sparkline values={[1]} max={1} capacity={1} tone='memory' label='b' />
        </>);
        const ids = [...html.matchAll(/<linearGradient id="([^"]+)"/g)].map(match => match[1]);
        expect(new Set(ids).size).to.equal(2);
    });
});

describe('MeterBar', () => {

    it('fills by scaling, so a change slides', () => {
        const html = renderToStaticMarkup(<MeterBar fraction={0.4242} tone='memory' label='Memory' />);
        expect(html).to.contain('transform:scaleX(0.424)');
        expect(html).to.contain('aria-valuenow="42.4"');
    });

    it('clamps the fraction, and shows nothing for one that is not a number', () => {
        expect(renderToStaticMarkup(<MeterBar fraction={1.5} tone='cpu' label='CPU' />)).to.contain('scaleX(1)');
        expect(renderToStaticMarkup(<MeterBar fraction={Number.NaN} tone='cpu' label='CPU' />)).to.contain('scaleX(0)');
    });
});

describe('Tile', () => {

    it('heads with its title and readout, and marks itself selected', () => {
        const html = renderToStaticMarkup(<Tile title='alpha' readout='87%' selected={true} />);
        expect(html).to.contain('class="gempba-tile gempba-tile-selected"').and.to.contain('aria-pressed="true"');
        expect(html).to.contain('<span class="gempba-tile-name"><span class="gempba-tile-title">alpha</span></span><span class="gempba-tile-readout">87%</span>');
    });

    it('marks itself dimmed', () => {
        expect(renderToStaticMarkup(<Tile title='alpha' dimmed={true} />)).to.contain('class="gempba-tile gempba-tile-dimmed"');
    });

    it('puts a status mark before its title', () => {
        expect(renderToStaticMarkup(<Tile title='alpha' status={<i className='dot' />} />))
            .to.contain('<span class="gempba-tile-name"><i class="dot"></i><span class="gempba-tile-title">alpha</span></span>');
    });
});
