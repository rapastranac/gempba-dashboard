import { expect } from 'chai';
import { TelemetryCommands } from './telemetry-command-contribution';
import { TelemetryViewActions } from './telemetry-view-actions';

/** A registry whose commands are visible and enabled as the test says, recording what runs and refusing a disabled one. */
class FakeCommands implements TelemetryViewActions.Commands {
    readonly ran: string[] = [];

    constructor(protected readonly enabled: string[], protected readonly hidden: readonly string[] = []) { }

    isVisible(id: string): boolean {
        return !this.hidden.includes(id);
    }

    isEnabled(id: string): boolean {
        return this.enabled.includes(id);
    }

    async executeCommand<T>(id: string): Promise<T | undefined> {
        if (!this.enabled.includes(id)) {
            throw new Error(`The command '${id}' cannot be executed. There are no active handlers available for the command.`);
        }
        this.ran.push(id);
        return undefined;
    }
}

describe('TelemetryViewActions', () => {

    it('offers Listen first and Connect where the hub would run them', () => {
        const commands = new FakeCommands([TelemetryCommands.LISTEN.id, TelemetryCommands.CONNECT.id]);
        expect(TelemetryViewActions.start(commands).map(({ label, primary }) => ({ label, primary }))).to.deep.equal([
            { label: 'Listen…', primary: true }, { label: 'Connect…', primary: false }
        ]);
    });

    it('leaves out Connect when no SSH mode is installed, or a session is open', () => {
        expect(TelemetryViewActions.start(new FakeCommands([TelemetryCommands.LISTEN.id], [TelemetryCommands.CONNECT.id])).map(button => button.label))
            .to.deep.equal(['Listen…']);
        expect(TelemetryViewActions.start(new FakeCommands([TelemetryCommands.LISTEN.id])).map(button => button.label)).to.deep.equal(['Listen…']);
    });

    it('gives the bar\'s actions their words and icons, and runs their commands', async () => {
        const commands = new FakeCommands([TelemetryCommands.RESUME.id, TelemetryCommands.SNAPSHOT.id]);
        const buttons = TelemetryViewActions.bar(commands, ['resume', 'snapshot']);
        expect(buttons.map(({ label, icon }) => ({ label, icon }))).to.deep.equal([
            { label: 'Resume', icon: 'debug-continue' }, { label: 'Snapshot', icon: 'device-camera' }
        ]);
        buttons.forEach(button => button.run());
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(commands.ran).to.deep.equal([TelemetryCommands.RESUME.id, TelemetryCommands.SNAPSHOT.id]);
    });

    it('offers Connect again once the SSH session is lost', () => {
        const buttons = TelemetryViewActions.bar(new FakeCommands([TelemetryCommands.CONNECT.id, TelemetryCommands.CLEAR.id]), ['connect', 'clear']);
        expect(buttons.map(({ label, icon }) => ({ label, icon }))).to.deep.equal([{ label: 'Connect…', icon: 'plug' }, { label: 'Clear', icon: 'clear-all' }]);
    });

    it('offers only the bar\'s actions the hub runs now', () => {
        const buttons = TelemetryViewActions.bar(new FakeCommands([TelemetryCommands.CLEAR.id]), ['listen', 'clear']);
        expect(buttons.map(button => button.label)).to.deep.equal(['Clear']);
    });

    it('swallows the refusal of a command disabled since its button was drawn', async () => {
        const enabled = [TelemetryCommands.CLEAR.id];
        const commands = new FakeCommands(enabled);
        const [clear] = TelemetryViewActions.bar(commands, ['clear']);
        enabled.pop();
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => unhandled.push(reason);
        process.on('unhandledRejection', onUnhandled);
        try {
            clear.run();
            await new Promise(resolve => setTimeout(resolve, 10));
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
        expect([commands.ran, unhandled]).to.deep.equal([[], []]);
    });
});
