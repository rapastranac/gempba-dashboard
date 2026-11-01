import { Duplex } from 'stream';
import { RefreshInterval } from '@gempba/core';
import { ControlKind, ControlLine } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { MockFault } from '../../common/mock-fault';
import { MockRun } from '../sim/mock-run';

export interface MockCenterOptions {
    readonly log?: (message: string) => void;
    /** Once the run ends, after every client is closed: gempba's process has exited. */
    readonly onEnded?: () => void;
    /** Whenever the clients or the intervals change. */
    readonly onChange?: () => void;
    /** A client whose unsent output passes this is dropped, so it never holds the others back. */
    readonly maxBufferedBytes?: number;
    /** A client that sends this much without a newline is dropped. */
    readonly maxInboundBytes?: number;
}

/**
 * The mock's stand-in for gempba's center: it advances the run with the wall clock and, every broadcast interval,
 * writes the run's latest frames to every client, the first one the moment a client connects. Control lines from any
 * client set the run's intervals, clamped as gempba clamps them, and apply at once.
 */
export class MockCenter {

    static readonly DEFAULT_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
    static readonly DEFAULT_MAX_INBOUND_BYTES = 64 * 1024;

    protected readonly clientsNow = new Map<Duplex, string>();
    protected readonly startedAt = performance.now();
    protected timer: NodeJS.Timeout | undefined;
    protected running = false;

    constructor(protected readonly mock: MockRun, protected readonly options: MockCenterOptions = {}) { }

    get run(): MockRun {
        return this.mock;
    }

    get clients(): number {
        return this.clientsNow.size;
    }

    start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        this.schedule();
    }

    /** Stops broadcasting and closes every client. */
    stop(): void {
        this.running = false;
        clearTimeout(this.timer);
        this.timer = undefined;
        this.closeAll();
    }

    /** Serves a connected client, a TCP socket or an SSH channel, named `who` in the log. */
    attach(stream: Duplex, who: string): void {
        if (!this.running) {
            stream.destroy();
            return;
        }
        this.clientsNow.set(stream, who);
        this.log(`${who} connected`);
        let inbound = '';
        stream.on('data', (chunk: Buffer | string) => {
            inbound += chunk.toString();
            let newline = inbound.indexOf('\n');
            while (newline >= 0) {
                this.control(inbound.slice(0, newline), who);
                inbound = inbound.slice(newline + 1);
                newline = inbound.indexOf('\n');
            }
            if (inbound.length > (this.options.maxInboundBytes ?? MockCenter.DEFAULT_MAX_INBOUND_BYTES)) {
                this.drop(stream, 'it sent too much without a newline');
            }
        });
        stream.on('error', () => undefined);
        stream.on('close', () => {
            if (this.clientsNow.delete(stream)) {
                this.log(`${who} disconnected`);
                this.options.onChange?.();
            }
        });
        this.options.onChange?.();
        this.send(stream, this.mock.line(Date.now()));
    }

    /** Applies a fault: the transport's own, or the run's. */
    fault(fault: MockFault): string {
        let message: string;
        if (fault === 'drop-clients') {
            const count = this.clientsNow.size;
            this.closeAll();
            message = `Dropped ${count} client${count === 1 ? '' : 's'}`;
        } else if (fault === 'malformed-line') {
            for (const stream of this.clientsNow.keys()) {
                this.send(stream, '{"version":1,"ts":');
            }
            message = 'Sent a malformed line';
        } else {
            message = this.mock.fault(fault);
        }
        this.log(message);
        if (this.mock.ended) {
            this.end();
        }
        return message;
    }

    protected schedule(): void {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.tick(), this.mock.broadcastIntervalMs);
    }

    protected tick(): void {
        if (!this.running) {
            return;
        }
        this.mock.advanceTo(performance.now() - this.startedAt);
        if (this.mock.ended) {
            this.end();
            return;
        }
        const line = this.mock.line(Date.now());
        for (const stream of this.clientsNow.keys()) {
            this.send(stream, line);
        }
        this.schedule();
    }

    protected send(stream: Duplex, line: string): void {
        if (stream.writableLength > (this.options.maxBufferedBytes ?? MockCenter.DEFAULT_MAX_BUFFERED_BYTES)) {
            this.drop(stream, 'it fell too far behind');
            return;
        }
        stream.write(line + '\n');
    }

    protected control(line: string, who: string): void {
        const message = ControlLine.parse(line);
        if (!message) {
            this.log(`Ignored a malformed control line from ${who}`);
            return;
        }
        const applied = RefreshInterval.clamp(message.value);
        const clamped = applied === message.value ? '' : ` (clamped from ${message.value})`;
        if (message.kind === ControlKind.SetWorkerIntervalMs) {
            this.mock.setIntervals(applied, this.mock.nodeIntervalMs);
        } else {
            this.mock.setIntervals(this.mock.workerIntervalMs, applied);
        }
        this.log(`${message.kind} → ${applied} ms${clamped}, from ${who}`);
        // the broadcast may follow the worker rate; a shorter one starts now rather than after the old wait
        if (this.running) {
            this.schedule();
        }
        this.options.onChange?.();
    }

    protected drop(stream: Duplex, why: string): void {
        this.log(`Dropped ${this.clientsNow.get(stream) ?? 'a client'}: ${why}`);
        this.close(stream);
    }

    protected closeAll(): void {
        for (const stream of [...this.clientsNow.keys()]) {
            this.close(stream);
        }
    }

    /** Forgets the client at once, so nothing more is written to it, then closes it. */
    protected close(stream: Duplex): void {
        if (this.clientsNow.delete(stream)) {
            this.options.onChange?.();
        }
        stream.destroy();
    }

    protected end(): void {
        this.log('The run ended: gempba\'s process exits and every client is closed');
        this.stop();
        this.options.onEnded?.();
    }

    protected log(message: string): void {
        this.options.log?.(message);
    }
}
