import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { MessageService } from '@theia/core/lib/common/message-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TelemetryService } from '@gempba/telemetry/lib/common';
import { RememberedSettings } from '../common/remembered-settings';
import { SettingsServer } from '../common/settings-protocol';

/**
 * Moves the rates the Connection view kept in the remembered settings, before the hub owned them, over to the hub's
 * settings, once. It runs at startup rather than in the Connection view, so the move does not depend on the view, and
 * the view loads the remembered settings only after it, so it never saves the moved rates back.
 */
@injectable()
export class RememberedRatesMove implements FrontendApplicationContribution {

    @inject(SettingsServer) protected readonly settingsServer: SettingsServer;
    @inject(TelemetryService) protected readonly telemetry: TelemetryService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected moving: Promise<void> | undefined;

    onStart(): void {
        this.moved();
    }

    /** Resolves once the remembered rates were moved, or there was nothing to move, or moving failed. */
    moved(): Promise<void> {
        this.moving ??= this.move();
        return this.moving;
    }

    protected async move(): Promise<void> {
        try {
            const settings = await this.settingsServer.load();
            const rates = RememberedSettings.ratesToMove(settings);
            if (rates.workerIntervalMs === undefined && rates.nodeIntervalMs === undefined) {
                return;
            }
            await this.telemetry.setRates(rates);
            await this.settingsServer.save(RememberedSettings.withoutRates(settings));
        } catch (error) {
            this.messages.error(`The remembered refresh rates could not be moved to the settings: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
