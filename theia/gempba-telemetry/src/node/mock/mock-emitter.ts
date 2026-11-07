import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { RefreshInterval } from '@gempba/core';
import { BroadcastEnvelope, ControlKind, ControlLine } from '../protocol/wire-protocol';

export interface MockEmitterOptions {
    readonly frames: readonly BroadcastEnvelope[];
    readonly intervalMs?: number;
    /** Reports each control line applied, with the clamped value. */
    readonly onControl?: (kind: ControlKind, appliedMs: number) => void;
}

/**
 * A stand-in for a gempba run's telemetry stream, for tests: replays a recording to every client, one line per
 * interval, looping at the end. Like gempba v4.3.0 it stamps the current time, drives every frame at the one interval,
 * and applies it, clamped to the server's bounds, under either of its control names.
 */
export class MockEmitter {

    static readonly FIXTURES_DIR = path.resolve(__dirname, '../../../fixtures');
    static readonly DEFAULT_FIXTURE = path.join(MockEmitter.FIXTURES_DIR, 'two-hosts.ndjson');

    static load(file: string): BroadcastEnvelope[] {
        return fs.readFileSync(file, 'utf8')
            .split('\n')
            .filter(line => line.trim() !== '')
            .map(line => BroadcastEnvelope.parse(line));
    }

    protected readonly server = net.createServer(socket => this.stream(socket));
    protected readonly peers = new Set<net.Socket>();
    protected interval: number;

    constructor(protected readonly options: MockEmitterOptions) {
        if (options.frames.length === 0) {
            throw new Error('MockEmitter needs at least one frame');
        }
        this.interval = clamp(options.intervalMs ?? RefreshInterval.DEFAULT_MS);
    }

    get intervalMs(): number {
        return this.interval;
    }

    /** Resolves with the bound port; port 0 lets the OS pick a free one. */
    listen(port = 0, host = '127.0.0.1'): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, host, () => resolve((this.server.address() as net.AddressInfo).port));
        });
    }

    close(): Promise<void> {
        this.peers.forEach(peer => peer.destroy());
        return new Promise(resolve => this.server.close(() => resolve()));
    }

    protected stream(socket: net.Socket): void {
        this.peers.add(socket);
        let cursor = 0;
        let timer: NodeJS.Timeout | undefined;
        const tick = () => {
            const frame = this.options.frames[cursor++ % this.options.frames.length];
            socket.write(JSON.stringify({ ...frame, ts: Date.now() }) + '\n');
            timer = setTimeout(tick, this.interval);
        };
        let buffered = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
            buffered += chunk;
            let newline = buffered.indexOf('\n');
            while (newline >= 0) {
                this.control(buffered.slice(0, newline));
                buffered = buffered.slice(newline + 1);
                newline = buffered.indexOf('\n');
            }
        });
        socket.on('error', () => undefined);
        socket.on('close', () => {
            clearTimeout(timer);
            this.peers.delete(socket);
        });
        tick();
    }

    protected control(line: string): void {
        const message = ControlLine.parse(line);
        // gempba v4.3.0 drives node frames at the one interval, so it ignores a node interval
        if (!message || !ControlLine.isInterval(message) || message.kind === ControlKind.SetNodeIntervalMs) {
            return;
        }
        this.interval = clamp(message.value);
        this.options.onControl?.(message.kind, this.interval);
    }
}

function clamp(ms: number): number {
    return Math.max(RefreshInterval.MIN_MS, Math.min(RefreshInterval.MAX_MS, ms));
}
