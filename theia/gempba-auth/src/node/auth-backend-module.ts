import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TunnelProvider } from '@gempba/telemetry/lib/node/tunnel/tunnel-provider';
import { AUTH_PROMPT_PATH, AuthPrompt } from '../common/auth-prompt';
import { HostTunnelProvider, JumpTunnelProvider } from './ssh-tunnel-provider';

/** Per window: the providers prompt through a proxy to that window's AuthPrompt. */
const authConnectionModule = ConnectionContainerModule.create(({ bind, bindFrontendService }) => {
    bindFrontendService(AUTH_PROMPT_PATH, AuthPrompt);
    bind(HostTunnelProvider).toSelf().inSingletonScope();
    bind(TunnelProvider).toService(HostTunnelProvider);
    bind(JumpTunnelProvider).toSelf().inSingletonScope();
    bind(TunnelProvider).toService(JumpTunnelProvider);
});

export default new ContainerModule(bind => {
    bind(ConnectionContainerModule).toConstantValue(authConnectionModule);
});
