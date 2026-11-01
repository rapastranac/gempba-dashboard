import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { ConnectionHandler, RpcConnectionHandler } from '@theia/core/lib/common/messaging';
import { ContainerModule } from '@theia/core/shared/inversify';
import { MOCK_SERVICE_PATH, MockClient } from '../common/mock-protocol';
import { MockService } from './mock-service';

/** One mock for the whole app: every window talks to the same service, which closes its ports when the app stops. */
export default new ContainerModule(bind => {
    bind(MockService).toDynamicValue(() => new MockService()).inSingletonScope();
    bind(BackendApplicationContribution).toDynamicValue(ctx => {
        const contribution: BackendApplicationContribution = { onStop: () => ctx.container.get(MockService).dispose() };
        return contribution;
    }).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx => new RpcConnectionHandler<MockClient>(MOCK_SERVICE_PATH, client => {
        const service = ctx.container.get(MockService);
        const registration = service.addClient(client);
        client.onDidCloseConnection(() => registration.dispose());
        return service;
    })).inSingletonScope();
});
