import { expect } from 'chai';
import { ConnectionState, RunSetup } from '@gempba/core';
import { StatusText } from './status-text';

const lastFrameAt = new Date(2026, 10, 5, 12, 4, 31).getTime();
const run: RunSetup = {
    scheduler: 'centralized', loadBalancer: 'quasi_horizontal', worldSize: 4, threadsPerProcess: 4, gempbaVersion: '4.3.0', annotations: [], markers: []
};
const stream = (overrides: Partial<StatusText.Stream>): StatusText.Stream => ({
    state: ConnectionState.LISTENING, condition: 'live', status: 'connected to 127.0.0.1:9000', nodes: 2, throughput: 12_400, intervalMs: 500,
    observed: { rankMs: 500 }, run, lastFrameAt, ...overrides
});

describe('StatusText', () => {

    it('sums up a live stream: its nodes, the cluster\'s tasks a second and the refresh rate', () => {
        expect(StatusText.of(stream({})).text).to.equal('$(pulse) GemPBA: 2 nodes · 12.4k tasks/s · 500 ms');
        expect(StatusText.of(stream({ nodes: 1, throughput: 3.5 })).text).to.equal('$(pulse) GemPBA: 1 node · 3.5 tasks/s · 500 ms');
        expect(StatusText.of(stream({ throughput: undefined })).text).to.equal('$(pulse) GemPBA: 2 nodes · 500 ms');
    });

    it('says why held data is not live, and when it is from, with an icon per cause', () => {
        const texts = (['paused', 'ended', 'reconnecting', 'stopped', 'disconnected', 'lost'] as const)
            .map(condition => StatusText.of(stream({ condition })).text);
        expect(texts).to.deep.equal([
            '$(debug-pause) GemPBA: paused · data from 12:04:31',
            '$(pass) GemPBA: run ended · data from 12:04:31',
            '$(sync~spin) GemPBA: reconnecting · data from 12:04:31',
            '$(debug-stop) GemPBA: stopped · data from 12:04:31',
            '$(debug-disconnect) GemPBA: disconnected · data from 12:04:31',
            '$(warning) GemPBA: connection lost · data from 12:04:31'
        ]);
        expect(StatusText.of(stream({ condition: 'stopped', lastFrameAt: undefined })).text).to.equal('$(debug-stop) GemPBA: stopped');
    });

    it('names the connection state, with an icon each, while no data is held', () => {
        const texts = [ConnectionState.DISCONNECTED, ConnectionState.CONNECTING, ConnectionState.CONNECTED, ConnectionState.LISTENING]
            .map(state => StatusText.of(stream({ state, condition: undefined })).text);
        expect(texts).to.deep.equal([
            '$(debug-disconnect) GemPBA: disconnected', '$(sync~spin) GemPBA: connecting', '$(plug) GemPBA: connected', '$(radio-tower) GemPBA: listening'
        ]);
    });

    it('shows on hover the status, the run\'s setup, its tasks a second while live, the refresh rate, and what a click does', () => {
        expect(StatusText.of(stream({})).tooltip.split('\n')).to.deep.equal([
            'connected to 127.0.0.1:9000',
            'Centralized · quasi-horizontal · 4 ranks · 4 threads · gempba 4.3.0',
            'Tasks started: 12,400 tasks/s',
            'Refresh rate 500 ms; rank frames arrive every 500 ms',
            'Click for the live controls.'
        ]);
        expect(StatusText.of(stream({ state: ConnectionState.DISCONNECTED, condition: 'stopped', status: 'stopped listening' })).tooltip.split('\n'))
            .to.deep.equal(['stopped listening', 'Centralized · quasi-horizontal · 4 ranks · 4 threads · gempba 4.3.0', 'Refresh rate 500 ms', 'Click for the live controls.']);
        expect(StatusText.of(stream({ state: ConnectionState.DISCONNECTED, condition: undefined, status: '', run: undefined })).tooltip.split('\n'))
            .to.deep.equal(['disconnected', 'Refresh rate 500 ms', 'Click for the live controls.']);
    });

    it('compacts a rate past a thousand a second, and keeps the usual words below', () => {
        expect([1_250, 999, 0.2].map(StatusText.rate)).to.deep.equal(['1.25k tasks/s', '999 tasks/s', '12 tasks/min']);
    });
});
