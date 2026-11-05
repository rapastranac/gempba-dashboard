import { Duplex } from 'stream';
import { RefreshInterval } from '@gempba/core';
import { ControlKind, ControlLine } from '@gempba/telemetry/lib/node/protocol/wire-protocol';
import { MockFault } from '../../common/mock-fault';
import { MockRun } from '../sim/mock-run';

export interface MockAggregatorOptions {
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
 * The mock's stand-in for gempba's aggregator, the telemetry server on rank 0: it advances the run with the wall clock and, every broadcast interval,
 * writes the run's latest frames to every client, the first one the moment a client connects. Control lines from any
 * client set the run's interval, clamped as gempba clamps it, and apply at once. When it stops, as gempba's process
 * exits, it closes every client, each first getting the run's final line.
 */
export class MockAggregator {

    static readonly DEFAULT_MAX_BUFFERED_BYTES = 16 * 1024 * 1024;
    static readonly DEFAULT_MAX_INBOUND_BYTES = 64 * 1024;
    /** How long a closing client has to take what it was last sent, as gempba's aggregator waits for the final frames. */
    static readonly CLOSE_GRACE_MS = 1000;

    protected readonly clientsNow = new Map<Duplex, string>();
    protected readonly startedAt = performance.now();
    protected timer: NodeJS.Timeout | undefined;
    protected running = false;

    constructor(protected readonly mock: MockRun, protected readonly options: MockAggregatorOptions = {}) { }

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

    /**
     * Stops broadcasting and closes every client once it has what it was sent, as gempba's process does when it exits.
     * That is the run's final line: every rank's last frame, marked `"final":true` even while paused, so a consumer can
     * tell a finished run from a lost connection.
     */
    stop(): void {
        if (!this.running) {
            return;
        }
        this.running = false;
        clearTimeout(this.timer);
        this.timer = undefined;
        const streams = [...this.clientsNow.keys()];
        if (streams.length > 0) {
            this.mock.snapshot();
            const final = this.mock.line(Date.now(), { final: true });
            streams.forEach(stream => this.send(stream, final));
            this.log(`Sent the run\'s final line to ${streams.length} client${streams.length === 1 ? '' : 's'}`);
        }
        streams.forEach(stream => this.close(stream, true));
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
            if (inbound.length > (this.options.maxInboundBytes ?? MockAggregator.DEFAULT_MAX_INBOUND_BYTES)) {
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
        this.timer = setTimeout(() => this.tick(), this.mock.intervalMs);
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
        if (stream.writableLength > (this.options.maxBufferedBytes ?? MockAggregator.DEFAULT_MAX_BUFFERED_BYTES)) {
            this.drop(stream, 'it fell too far behind');
            return;
        }
        stream.write(line + '\n');
    }

    /**
     * Answers a control line as gempba v4.3.0 does: it takes the one interval under either of its names, ignores the node
     * interval, and pauses, resumes, snapshots and marks.
     */
    protected control(line: string, who: string): void {
        const message = ControlLine.parse(line);
        if (!message) {
            this.log(`Ignored a malformed control line from ${who}`);
            return;
        }
        if (ControlLine.isInterval(message)) {
            if (message.kind === ControlKind.SetNodeIntervalMs) {
                this.log(`Ignored ${message.kind} from ${who}: gempba 4.3 drives node frames at the one interval`);
                return;
            }
            const applied = RefreshInterval.clamp(message.value);
            const clamped = applied === message.value ? '' : ` (clamped from ${message.value})`;
            this.mock.setIntervalMs(applied);
            this.log(`${message.kind} → ${applied} ms${clamped}, from ${who}`);
            // the broadcast follows the interval; a shorter one starts now rather than after the old wait
            if (this.running) {
                this.schedule();
            }
        } else if (message.kind === ControlKind.Mark) {
            this.log(this.mock.mark(message.label)
                ? `Marked "${message.label}", from ${who}`
                : `Ignored a marker from ${who}: the run holds ${MockRun.MAX_MARKERS} already`);
        } else if (message.kind === ControlKind.Snapshot) {
            this.mock.snapshot();
            const full = this.mock.line(Date.now(), { full: true });
            for (const stream of this.clientsNow.keys()) {
                this.send(stream, full);
            }
            this.log(`Sent a snapshot, for ${who}`);
        } else if (message.kind === ControlKind.Pause) {
            this.mock.pause();
            this.log(`Paused, for ${who}: the ranks stop sending frames and the lines carry the header alone`);
        } else {
            this.mock.resume();
            this.log(`Resumed, for ${who}`);
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

    /** Forgets the client at once, so nothing more is written to it, then closes it: at once, or once it has what it was sent. */
    protected close(stream: Duplex, graceful = false): void {
        if (this.clientsNow.delete(stream)) {
            this.options.onChange?.();
        }
        if (graceful && !stream.destroyed) {
            stream.end();
            // a client that doesn't read what is left is closed anyway
            setTimeout(() => stream.destroy(), MockAggregator.CLOSE_GRACE_MS).unref();
        } else {
            stream.destroy();
        }
    }

    protected end(): void {
        this.log('The run ended: gempba\'s process exits and closes every client');
        this.stop();
        this.options.onEnded?.();
    }

    protected log(message: string): void {
        this.options.log?.(message);
    }
}
