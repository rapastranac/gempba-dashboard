import { injectable } from '@theia/core/shared/inversify';
import { ConnectionMode, TargetSpec } from '@gempba/core';
import { Forward, Tunnel, TunnelProvider } from './tunnel-provider';

/** LOCAL mode: gempba runs on this machine, so the target port is dialled directly. */
@injectable()
export class LocalTunnelProvider implements TunnelProvider {

    readonly mode = ConnectionMode.LOCAL;

    async open(): Promise<Tunnel> {
        return {
            forward: async (target: TargetSpec): Promise<Forward> => ({ port: target.gempbaPort, close: () => undefined }),
            close: () => undefined
        };
    }
}
