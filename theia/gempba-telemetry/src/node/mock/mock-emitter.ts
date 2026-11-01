import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { RefreshInterval } from '@gempba/core';
import { BroadcastEnvelope, ControlKind, ControlLine } from '../protocol/wire-protocol';

export interface MockEmitterOptions {
    readonly frames: readonly BroadcastEnvelope[];
    readonly workerIntervalMs?: number;
    readonly nodeIntervalMs?: number;
    /** Reports each control line applied, with the clamped value. */
    readonly onControl?: (kind: ControlKind, appliedMs: number) => void;
}

/**
 * A stand-in gempba center for tests: replays a recording to every client, one frame per
 * worker interval, looping at the end. Like gempba it stamps the current time, keeps node frames only on
 * node ticks, and applies control lines clamped to the server's bounds.
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
    protected workerInterval: number;
    protected nodeInterval: number;

    constructor(protected readonly options: MockEmitterOptions) {
        if (options.frames.length === 0) {
            throw new Error('MockEmitter needs at least one frame');
        }
        this.workerInterval = clamp(options.workerIntervalMs ?? RefreshInterval.DEFAULT_WORKER_MS);
        this.nodeInterval = clamp(options.nodeIntervalMs ?? RefreshInterval.DEFAULT_NODE_MS);
    }

    get workerIntervalMs(): number {
        return this.workerInterval;
    }

    get nodeIntervalMs(): number {
        return this.nodeInterval;
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
        let lastNodeTick = -Infinity;
        let timer: NodeJS.Timeout | undefined;
        const tick = () => {
            const now = Date.now();
            const nodeTick = now - lastNodeTick >= this.nodeInterval;
            if (nodeTick) {
                lastNodeTick = now;
            }
            const frame = this.options.frames[cursor++ % this.options.frames.length];
            socket.write(JSON.stringify({ ...frame, ts: now, nodes: nodeTick ? frame.nodes : [] }) + '\n');
            timer = setTimeout(tick, this.workerInterval);
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
        if (!message) {
            return;
        }
        const applied = clamp(message.value);
        if (message.kind === ControlKind.SetWorkerIntervalMs) {
            this.workerInterval = applied;
        } else {
            this.nodeInterval = applied;
        }
        this.options.onControl?.(message.kind, applied);
    }
}

function clamp(ms: number): number {
    return Math.max(RefreshInterval.MIN_MS, Math.min(RefreshInterval.MAX_MS, ms));
}
