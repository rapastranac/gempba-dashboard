import { Emitter } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';
import { MockClient, MockLogLine, MockStatus } from '../common/mock-protocol';

/** Receives the backend's notifications and re-emits them inside the frontend. */
@injectable()
export class MockClientImpl implements MockClient {

    protected readonly onStatusEmitter = new Emitter<MockStatus>();
    protected readonly onLogEmitter = new Emitter<MockLogLine>();

    readonly statuses = this.onStatusEmitter.event;
    readonly logs = this.onLogEmitter.event;

    onStatus(status: MockStatus): void {
        this.onStatusEmitter.fire(status);
    }

    onLog(line: MockLogLine): void {
        this.onLogEmitter.fire(line);
    }
}
