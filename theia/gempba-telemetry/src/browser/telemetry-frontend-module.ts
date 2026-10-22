import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { ContainerModule } from '@theia/core/shared/inversify';
import { NodeHistoryStore } from '@gempba/core';
import { TELEMETRY_SERVICE_PATH, TelemetryServer } from '../common/telemetry-protocol';
import { NodeHistoryService, TelemetryService } from '../common/telemetry-service';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';
import { TelemetryServiceImpl } from './telemetry-service-impl';

export default new ContainerModule(bind => {
    bind(TelemetryServerClientImpl).toSelf().inSingletonScope();
    bind(TelemetryServer).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<TelemetryServer>(ctx.container, TELEMETRY_SERVICE_PATH, ctx.container.get(TelemetryServerClientImpl))
    ).inSingletonScope();

    bind(NodeHistoryStore).toDynamicValue(() => new NodeHistoryStore()).inSingletonScope();
    bind(NodeHistoryService).toService(NodeHistoryStore);
    bind(TelemetryServiceImpl).toSelf().inSingletonScope();
    bind(TelemetryService).toService(TelemetryServiceImpl);
});
