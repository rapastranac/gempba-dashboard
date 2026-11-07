import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { renderToStaticMarkup } from '@theia/core/shared/react-dom/server';
import { StreamBar } from './stream-bar';

describe('StreamBar', () => {

    it('marks the bar with its liveness colour and says why the data is not live', () => {
        const html = renderToStaticMarkup(<StreamBar tone='off' text='Not live · last frame 2 min ago (12:04:31) · stopped' />);
        expect(html).to.match(/^<div class="gempba-stream-bar gempba-stream-bar-off" role="status">/);
        expect(html).to.contain('<span class="gempba-live gempba-live-off gempba-live-compact" aria-hidden="true"><span class="gempba-live-dot"></span></span>');
        expect(html).to.contain('<span class="gempba-stream-bar-text" title="Not live · last frame 2 min ago (12:04:31) · stopped">Not live');
        expect(html).not.to.contain('gempba-stream-bar-actions');
    });

    it('offers its actions as buttons with their icons', () => {
        const html = renderToStaticMarkup(<StreamBar tone='paused' text='Paused' actions={[
            { label: 'Resume', icon: 'debug-continue', run: () => undefined },
            { label: 'Snapshot', run: () => undefined }
        ]} />);
        expect(html).to.contain('<span class="gempba-stream-bar-actions"><button type="button" class="theia-button secondary">'
            + '<span class="codicon codicon-debug-continue" aria-hidden="true"></span>Resume</button>'
            + '<button type="button" class="theia-button secondary">Snapshot</button></span>');
    });
});
