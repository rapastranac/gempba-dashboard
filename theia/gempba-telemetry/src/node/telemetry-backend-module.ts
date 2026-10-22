import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { ContainerModule } from '@theia/core/shared/inversify';
import { TELEMETRY_SERVICE_PATH, TelemetryServer, TelemetryServerClient } from '../common/telemetry-protocol';
import { TelemetryServerImpl } from './telemetry-server-impl';
import { LocalTunnelProvider } from './tunnel/local-tunnel-provider';
import { TunnelProvider } from './tunnel/tunnel-provider';

/**
 * One TelemetryServerImpl per frontend connection, disposed when that window goes away. The connection container
 * binds a ContributionProvider of its own, hiding the application's, so the TunnelProvider one is bound here; it
 * still collects the providers other extensions bind in the application container.
 */
const telemetryConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bindContributionProvider(bind, TunnelProvider);
    bind(TelemetryServerImpl).toSelf().inSingletonScope();
    bind(TelemetryServer).toService(TelemetryServerImpl);
    bindBackendService<TelemetryServer, TelemetryServerClient>(TELEMETRY_SERVICE_PATH, TelemetryServer, (server, client) => {
        server.setClient(client);
        client.onDidCloseConnection(() => server.dispose());
        return server;
    });
});

export default new ContainerModule(bind => {
    bind(LocalTunnelProvider).toSelf().inSingletonScope();
    bind(TunnelProvider).toService(LocalTunnelProvider);
    bind(ConnectionContainerModule).toConstantValue(telemetryConnectionModule);
});
