import { CommonMenus } from '@theia/core/lib/browser/common-menus';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { MessageService } from '@theia/core/lib/common/message-service';
import { inject, injectable } from '@theia/core/shared/inversify';
import { UpdateText } from '../common/update-text';
import { DownloadResult, UpdateCheck, Updater } from '../common/updater-protocol';
import { UpdaterClientImpl } from './updater-client-impl';

export namespace UpdaterCommands {
    export const CHECK: Command = { id: 'gempba.updates.check', category: 'GemPBA', label: 'Check for Updates…' };
}

type Available = Extract<UpdateCheck, { kind: 'available' }>;

/**
 * Says when a newer version is out, at startup and from Help › Check for Updates…, and downloads and installs it only
 * on the user's click. A failed check at startup stays silent.
 */
@injectable()
export class UpdaterContribution implements CommandContribution, MenuContribution, FrontendApplicationContribution {

    @inject(Updater) protected readonly updater: Updater;
    @inject(UpdaterClientImpl) protected readonly client: UpdaterClientImpl;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(WindowService) protected readonly windows: WindowService;
    @inject(FrontendApplicationStateService) protected readonly appState: FrontendApplicationStateService;

    protected get app(): string {
        return FrontendApplicationConfigProvider.get().applicationName;
    }

    onStart(): void {
        this.appState.reachedState('ready')
            .then(() => this.updater.checkAtStartup())
            .then(check => check?.kind === 'available' ? this.offer(check) : undefined)
            .catch(error => console.info('gempba:updater: no check at startup', error));
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(UpdaterCommands.CHECK, { execute: () => this.check() });
    }

    registerMenus(menus: MenuModelRegistry): void {
        // right after About
        menus.registerMenuAction(CommonMenus.HELP, { commandId: UpdaterCommands.CHECK.id, label: UpdaterCommands.CHECK.label, order: '9a' });
    }

    protected async check(): Promise<void> {
        const progress = await this.messages.showProgress({ text: UpdateText.CHECKING });
        let check: UpdateCheck;
        try {
            check = await this.updater.check();
        } catch (error) {
            check = { kind: 'failed', reason: UpdateText.reason(error) };
        } finally {
            progress.cancel();
        }
        switch (check.kind) {
            case 'available':
                return this.offer(check);
            case 'up-to-date':
                this.messages.info(UpdateText.upToDate(this.app, check.version));
                return;
            case 'failed':
                this.messages.warn(UpdateText.checkFailed(check.reason));
                return;
            case 'inactive':
                this.messages.info(UpdateText.INACTIVE);
                return;
        }
    }

    protected async offer(update: Available): Promise<void> {
        const page = update.releasePage;
        if (update.mode === 'notice') {
            if (!page) {
                this.messages.info(UpdateText.available(this.app, update.version));
                return;
            }
            if (await this.messages.info(UpdateText.availableFromPage(this.app, update.version), UpdateText.OPEN_RELEASE_PAGE)) {
                this.windows.openNewWindow(page, { external: true });
            }
            return;
        }
        const answer = page
            ? await this.messages.info(UpdateText.available(this.app, update.version), UpdateText.UPDATE, UpdateText.RELEASE_NOTES)
            : await this.messages.info(UpdateText.available(this.app, update.version), UpdateText.UPDATE);
        if (answer === UpdateText.UPDATE) {
            return this.download(update);
        }
        if (answer === UpdateText.RELEASE_NOTES && page) {
            this.windows.openNewWindow(page, { external: true });
            // the notes don't answer the offer, so it stays
            return this.offer(update);
        }
    }

    protected async download(update: Available): Promise<void> {
        const progress = await this.messages.showProgress({ text: UpdateText.downloading(this.app, update.version) });
        const listener = this.client.downloadProgress(percent => progress.report({ message: UpdateText.progress(percent), work: { done: percent, total: 100 } }));
        let result: DownloadResult;
        try {
            result = await this.updater.download();
        } catch (error) {
            result = { ok: false, reason: UpdateText.reason(error) };
        } finally {
            listener.dispose();
            progress.cancel();
        }
        if (!result.ok) {
            this.messages.warn(UpdateText.downloadFailed(result.reason));
            return;
        }
        if (await this.messages.info(UpdateText.ready(this.app, update.version), UpdateText.RESTART, UpdateText.LATER) === UpdateText.RESTART) {
            await this.updater.install();
        }
    }
}
