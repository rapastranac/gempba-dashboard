import '../../src/browser/style/index.css';

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { OpenHandler } from '@theia/core/lib/browser/opener-service';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandContribution } from '@theia/core/lib/common/command';
import { MenuContribution } from '@theia/core/lib/common/menu';
import { PreferenceContribution } from '@theia/core/lib/common/preferences/preference-schema';
import { ContainerModule } from '@theia/core/shared/inversify';
import { NodeHistoryStore, RankHistoryStore } from '@gempba/core';
import { TELEMETRY_SERVICE_PATH, TelemetryServer } from '../common/telemetry-protocol';
import { NodeHistoryService, TelemetryService, RankHistoryService } from '../common/telemetry-service';
import { NodeLinkFallbackOpener } from './node-link-fallback-opener';
import { RateChipContribution } from './rate-chip-contribution';
import { RateControlsContribution } from './rate-controls-contribution';
import { PreferenceRateSettings, RatePreferences, RateSettings } from './rate-settings';
import { TelemetryCommandContribution } from './telemetry-command-contribution';
import { TelemetryServerClientImpl } from './telemetry-server-client-impl';
import { TelemetryServiceImpl } from './telemetry-service-impl';
import { TelemetryStatusBarContribution } from './telemetry-status-bar-contribution';

export default new ContainerModule(bind => {
    bind(TelemetryServerClientImpl).toSelf().inSingletonScope();
    bind(TelemetryServer).toDynamicValue(ctx =>
        ServiceConnectionProvider.createProxy<TelemetryServer>(ctx.container, TELEMETRY_SERVICE_PATH, ctx.container.get(TelemetryServerClientImpl))
    ).inSingletonScope();

    bind(NodeHistoryStore).toDynamicValue(() => new NodeHistoryStore()).inSingletonScope();
    bind(NodeHistoryService).toService(NodeHistoryStore);
    bind(RankHistoryStore).toDynamicValue(() => new RankHistoryStore()).inSingletonScope();
    bind(RankHistoryService).toService(RankHistoryStore);
    bind(PreferenceContribution).toConstantValue({ schema: RatePreferences.SCHEMA });
    bind(RateSettings).to(PreferenceRateSettings).inSingletonScope();
    bind(TelemetryServiceImpl).toSelf().inSingletonScope();
    bind(TelemetryService).toService(TelemetryServiceImpl);

    bind(TelemetryCommandContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(TelemetryCommandContribution);
    bind(MenuContribution).toService(TelemetryCommandContribution);
    bind(RateControlsContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(RateControlsContribution);
    bind(MenuContribution).toService(RateControlsContribution);
    bind(TabBarToolbarContribution).to(RateChipContribution).inSingletonScope();
    bind(FrontendApplicationContribution).to(TelemetryStatusBarContribution).inSingletonScope();
    bind(OpenHandler).to(NodeLinkFallbackOpener).inSingletonScope();
});
