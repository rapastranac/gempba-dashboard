import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar-types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { MockLabels } from '../common/mock-labels';
import { MockStatus } from '../common/mock-protocol';
import { MockCommands } from './mock-command-contribution';
import { MockController } from './mock-controller';

/** A status bar entry while the mock runs, whose click lists the mocker's actions. */
@injectable()
export class MockStatusBarContribution implements FrontendApplicationContribution {

    static readonly ID = 'gempba-mock-status';

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(MockController) protected readonly mock: MockController;

    onStart(): void {
        this.mock.onStatus(status => this.show(status));
    }

    protected show(status: MockStatus): void {
        if (!status.running || !status.config) {
            this.statusBar.removeElement(MockStatusBarContribution.ID);
            return;
        }
        const mode = MockLabels.of(MockLabels.MODES, status.config.access.mode).label;
        this.statusBar.setElement(MockStatusBarContribution.ID, {
            text: `$(beaker) Mock: ${mode} · ${status.clients} client${status.clients === 1 ? '' : 's'}`,
            tooltip: `${MockStatus.summary(status)}\nClick for the mocker's actions.`,
            alignment: StatusBarAlignment.LEFT, priority: 90, command: MockCommands.ACTIONS.id
        });
    }
}
