import * as net from 'net';
import { BroadcastEnvelope, ControlLine } from '../protocol/wire-protocol';
import { FrameListener } from './frame-listener';

export interface TelemetryClientOptions {
    readonly reconnectBackoffMs?: number;
    /** When false the client stops after the first disconnect, leaving any retry to the caller. */
    readonly autoReconnect?: boolean;
}

/**
 * Reader of the line-delimited JSON stream that a gempba run's rank 0, the aggregator, serves, with control lines written back on the same
 * socket. A malformed line is skipped without dropping the connection.
 */
export class TelemetryClient {

    static readonly DEFAULT_RECONNECT_BACKOFF_MS = 1000;

    protected readonly reconnectBackoffMs: number;
    protected readonly autoReconnect: boolean;
    protected running = false;
    protected socket: net.Socket | undefined;
    protected retryTimer: NodeJS.Timeout | undefined;

    constructor(
        protected readonly host: string,
        protected readonly port: number,
        protected readonly listener: FrameListener,
        options: TelemetryClientOptions = {}
    ) {
        this.reconnectBackoffMs = options.reconnectBackoffMs ?? TelemetryClient.DEFAULT_RECONNECT_BACKOFF_MS;
        this.autoReconnect = options.autoReconnect ?? true;
    }

    start(): void {
        if (this.running) {
            return;
        }
        this.running = true;
        this.connect();
    }

    close(): void {
        this.running = false;
        clearTimeout(this.retryTimer);
        this.retryTimer = undefined;
        this.socket?.destroy();
        this.socket = undefined;
    }

    /** False when not connected; true once the line is handed to the socket. */
    sendControl(kind: ControlLine.IntervalKind, value: number): boolean {
        const socket = this.socket;
        if (!socket || socket.readyState !== 'open') {
            return false;
        }
        socket.write(ControlLine.format(kind, value));
        return true;
    }

    protected connect(): void {
        const socket = net.createConnection({ host: this.host, port: this.port });
        this.socket = socket;
        let buffered = '';
        let failure: Error | undefined;
        socket.setEncoding('utf8');
        socket.on('connect', () => {
            if (this.isCurrent(socket)) {
                this.listener.onConnected();
            }
        });
        socket.on('data', (chunk: string) => {
            buffered += chunk;
            let newline = buffered.indexOf('\n');
            while (newline >= 0 && this.isCurrent(socket)) {
                this.deliver(buffered.slice(0, newline));
                buffered = buffered.slice(newline + 1);
                newline = buffered.indexOf('\n');
            }
        });
        socket.on('error', error => {
            failure = error;
        });
        socket.on('close', () => {
            if (!this.isCurrent(socket)) {
                return;
            }
            this.socket = undefined;
            this.listener.onDisconnected(failure);
            if (!this.running) {
                return;
            }
            if (this.autoReconnect) {
                this.retryTimer = setTimeout(() => this.connect(), this.reconnectBackoffMs);
            } else {
                this.running = false;
            }
        });
    }

    protected deliver(line: string): void {
        if (line.trim() === '') {
            return;
        }
        try {
            this.listener.onFrame(BroadcastEnvelope.parse(line));
        } catch {
            // The C++ side owns the contract; one bad frame must not kill the stream.
        }
    }

    protected isCurrent(socket: net.Socket): boolean {
        return this.running && this.socket === socket;
    }
}
