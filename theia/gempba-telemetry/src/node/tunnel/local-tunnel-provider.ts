import { Event } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';
import { ConnectionMode, TargetSpec } from '@gempba/core';
import { Forward, Tunnel, TunnelProvider } from './tunnel-provider';

/** LOCAL mode: gempba runs on this machine, so the target port is dialled directly; there is no session to drop. */
@injectable()
export class LocalTunnelProvider implements TunnelProvider {

    readonly mode = ConnectionMode.LOCAL;

    async open(): Promise<Tunnel> {
        return {
            onClose: Event.None,
            forward: async (target: TargetSpec): Promise<Forward> => ({ port: target.gempbaPort, close: () => undefined }),
            close: () => undefined
        };
    }
}
