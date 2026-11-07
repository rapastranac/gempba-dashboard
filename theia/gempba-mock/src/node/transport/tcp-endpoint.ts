import * as net from 'net';
import { MockAggregator } from './mock-aggregator';

/** Local mode: the mock's telemetry listens on a loopback port, as gempba's does, and the dashboard connects to it. */
export class MockTcpEndpoint {

    protected readonly server = net.createServer(socket => {
        socket.setNoDelay(true);
        this.aggregator.attach(socket, `TCP client ${socket.remotePort}`);
    });

    constructor(protected readonly aggregator: MockAggregator) { }

    /** Resolves with the bound port; port 0 lets the OS pick a free one. */
    listen(port: number): Promise<number> {
        return new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(port, '127.0.0.1', () => {
                this.server.off('error', reject);
                resolve((this.server.address() as net.AddressInfo).port);
            });
        });
    }

    close(): Promise<void> {
        return new Promise(resolve => this.server.close(() => resolve()));
    }
}
