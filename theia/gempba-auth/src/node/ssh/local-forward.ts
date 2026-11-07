import * as net from 'net';
import { Forward } from '@gempba/telemetry/lib/node/tunnel/tunnel-provider';
import { Client, ClientChannel } from 'ssh2';

/**
 * A loopback listener whose every connection is carried over the SSH session to `dstPort` on the far side.
 * Closing it removes only this listener (and, for JUMP, the hop it was started with); the session stays up.
 */
export class LocalForward implements Forward {

    protected readonly sockets = new Set<net.Socket>();
    protected closed = false;

    protected constructor(protected readonly server: net.Server, readonly port: number, protected readonly hop?: ClientChannel,
        protected readonly onClose?: (forward: LocalForward) => void) { }

    static async open(client: Client, dstPort: number, hop?: ClientChannel, onClose?: (forward: LocalForward) => void): Promise<LocalForward> {
        let forward: LocalForward | undefined;
        const server = net.createServer(socket => forward?.carry(client, socket, dstPort));
        const port = await new Promise<number>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port));
        });
        forward = new LocalForward(server, port, hop, onClose);
        return forward;
    }

    close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.server.close();
        this.sockets.forEach(socket => socket.destroy());
        this.hop?.close();
        this.onClose?.(this);
    }

    protected carry(client: Client, socket: net.Socket, dstPort: number): void {
        this.sockets.add(socket);
        socket.on('error', () => undefined);
        socket.on('close', () => this.sockets.delete(socket));
        try {
            client.forwardOut('127.0.0.1', socket.remotePort ?? 0, '127.0.0.1', dstPort, (error, stream) => {
                if (error || socket.destroyed) {
                    socket.destroy();
                    stream?.close();
                    return;
                }
                stream.on('error', () => undefined);
                stream.on('close', () => socket.destroy());
                socket.on('close', () => stream.close());
                socket.pipe(stream).pipe(socket);
            });
        } catch {
            // ssh2 throws synchronously once the session is gone; the caller sees a dropped connection.
            socket.destroy();
        }
    }
}
