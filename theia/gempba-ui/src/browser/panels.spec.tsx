import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { renderToStaticMarkup } from '@theia/core/shared/react-dom/server';
import { EmptyState, HeroStat, Panel, SegmentedControl } from './panels';

describe('Panel', () => {

    it('titles its content, with actions beside the title', () => {
        const html = renderToStaticMarkup(<Panel title='Throughput' actions={<button>1 min</button>}><p>chart</p></Panel>);
        expect(html).to.match(/^<section class="gempba-panel" aria-label="Throughput"><header class="gempba-panel-header"><h3 class="gempba-panel-title">Throughput<\/h3>/);
        expect(html).to.contain('<div class="gempba-panel-actions"><button>1 min</button></div>');
        expect(html).to.contain('<p>chart</p>');
    });

    it('leaves out an empty actions row', () => {
        expect(renderToStaticMarkup(<Panel title='CPU' />)).not.to.contain('gempba-panel-actions');
    });
});

describe('HeroStat', () => {

    it('shows the figure large, with its label, unit and detail', () => {
        const html = renderToStaticMarkup(<HeroStat label='Cores busy' value='6.9' unit='of 8' detail='86% of the allocation' tone='cpu' />);
        expect(html).to.contain('class="gempba-hero gempba-tone-cpu"');
        expect(html).to.contain('<span class="gempba-hero-label">Cores busy</span>');
        expect(html).to.contain('<span class="gempba-hero-value">6.9<span class="gempba-hero-unit">of 8</span></span>');
        expect(html).to.contain('<span class="gempba-hero-detail">86% of the allocation</span>');
    });

    it('says what the figure counts on hover', () => {
        expect(renderToStaticMarkup(<HeroStat label='Tasks started' value='12' hint='Subtrees handed to threads' />))
            .to.match(/^<div class="gempba-hero" title="Subtrees handed to threads">/);
    });

    it('points the way the figure trends, and how far', () => {
        const up = renderToStaticMarkup(<HeroStat label='Tasks/s' value='12k' trend={{ direction: 'up', change: 0.204 }} />);
        expect(up).to.contain('class="gempba-hero-trend codicon codicon-arrow-up" role="img" aria-label="rising 20%"');
        const down = renderToStaticMarkup(<HeroStat label='Tasks/s' value='9k' trend={{ direction: 'down' }} />);
        expect(down).to.contain('codicon-arrow-down" role="img" aria-label="falling"');
    });

    it('shows no arrow for a flat trend', () => {
        expect(renderToStaticMarkup(<HeroStat label='Tasks/s' value='9k' trend={{ direction: 'flat', change: 0.01 }} />)).not.to.contain('gempba-hero-trend');
    });
});

describe('SegmentedControl', () => {

    it('offers every choice in a radio group, the current one checked', () => {
        const html = renderToStaticMarkup(<SegmentedControl label='Mode' value='host' onChange={() => undefined}
            options={[{ value: 'local', label: 'Local' }, { value: 'host', label: 'Host', title: 'A VM over SSH' }]} />);
        expect(html).to.contain('<div class="gempba-segmented" role="radiogroup" aria-label="Mode">');
        expect(html).to.contain('role="radio" class="gempba-segmented-option" aria-checked="false">Local</button>');
        expect(html).to.contain('role="radio" class="gempba-segmented-option" aria-checked="true" title="A VM over SSH">Host</button>');
    });

    it('can be disabled whole', () => {
        const html = renderToStaticMarkup(<SegmentedControl label='Mode' value='a' onChange={() => undefined} disabled
            options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />);
        expect(html.match(/disabled=""/g)).to.have.lengthOf(2);
    });
});

describe('EmptyState', () => {

    it('says what is missing and offers the actions that bring it, the primary one first in style', () => {
        const html = renderToStaticMarkup(<EmptyState icon='plug' title='No telemetry yet' message='Listen to a gempba run to see its nodes.'
            actions={[{ label: 'Listen…', run: () => undefined, primary: true }, { label: 'Connect…', run: () => undefined }]} />);
        expect(html).to.contain('<span class="gempba-empty-icon codicon codicon-plug" aria-hidden="true">');
        expect(html).to.contain('<h2 class="gempba-empty-title">No telemetry yet</h2>');
        expect(html).to.contain('<p class="gempba-empty-message">Listen to a gempba run to see its nodes.</p>');
        expect(html).to.contain('<button type="button" class="theia-button">Listen…</button><button type="button" class="theia-button secondary">Connect…</button>');
    });

    it('leaves out the message and actions it was not given', () => {
        const html = renderToStaticMarkup(<EmptyState icon='pulse' title='Nothing here' />);
        expect(html).not.to.contain('gempba-empty-message');
        expect(html).not.to.contain('gempba-empty-actions');
    });
});
