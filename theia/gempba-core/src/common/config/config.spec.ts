import { expect } from 'chai';
import { Config } from './config';

const EMPTY_ENV: Config.Environment = () => undefined;

function envOf(values: Record<string, string>): Config.Environment {
    return name => values[name];
}

describe('Config', () => {

    it('defaults when there are no args and no env', () => {
        const config = Config.from([], EMPTY_ENV);
        expect(config.port).to.equal(Config.DEFAULT_PORT);
        expect(config.sshHost).to.equal('');
        expect(config.jumpHost).to.equal('');
        expect(config.sshKey).to.equal('');
        expect(Config.usesSshTunnel(config)).to.be.false;
    });

    it('an env var overrides the default port', () => {
        expect(Config.from([], envOf({ [Config.ENV_PORT]: '9100' })).port).to.equal(9100);
    });

    it('the CLI equals form overrides env', () => {
        expect(Config.from(['--port=9200'], envOf({ [Config.ENV_PORT]: '9100' })).port).to.equal(9200);
    });

    it('the CLI space form overrides env', () => {
        expect(Config.from(['--port', '9300'], EMPTY_ENV).port).to.equal(9300);
    });

    it('an invalid env port falls back to the default', () => {
        expect(Config.from([], envOf({ [Config.ENV_PORT]: 'not-a-number' })).port).to.equal(Config.DEFAULT_PORT);
    });

    it('an invalid CLI port keeps the env value', () => {
        expect(Config.from(['--port=garbage'], envOf({ [Config.ENV_PORT]: '9100' })).port).to.equal(9100);
    });

    it('unknown args are ignored', () => {
        expect(Config.from(['--something-else', 'value', '--port=9100'], EMPTY_ENV).port).to.equal(9100);
    });

    it('a blank env value falls back to the default', () => {
        expect(Config.from([], envOf({ [Config.ENV_PORT]: '   ' })).port).to.equal(Config.DEFAULT_PORT);
    });

    it('ssh host from the CLI equals form', () => {
        const config = Config.from(['--ssh-host=user@vm-ip'], EMPTY_ENV);
        expect(config.sshHost).to.equal('user@vm-ip');
        expect(Config.usesSshTunnel(config)).to.be.true;
    });

    it('ssh host from the CLI space form', () => {
        expect(Config.from(['--ssh-host', 'user@vm-ip'], EMPTY_ENV).sshHost).to.equal('user@vm-ip');
    });

    it('ssh host from env', () => {
        const config = Config.from([], envOf({ [Config.ENV_SSH_HOST]: 'user@vm-ip' }));
        expect(config.sshHost).to.equal('user@vm-ip');
        expect(Config.usesSshTunnel(config)).to.be.true;
    });

    it('ssh key from the CLI overrides env', () => {
        expect(Config.from(['--ssh-key=/cli/key.pem'], envOf({ [Config.ENV_SSH_KEY]: '/env/key.pem' })).sshKey).to.equal('/cli/key.pem');
    });

    it('ssh fields default to empty strings', () => {
        const config = Config.of({ port: 1 });
        expect([config.sshHost, config.jumpHost, config.sshKey]).to.deep.equal(['', '', '']);
        expect(Config.usesSshTunnel(config)).to.be.false;
    });

    it('a blank ssh host does not use a tunnel', () => {
        expect(Config.usesSshTunnel(Config.of({ port: 1, sshHost: '   ' }))).to.be.false;
    });

    it('jump host from the CLI equals form', () => {
        expect(Config.from(['--jump-host=user@login.cluster.edu'], EMPTY_ENV).jumpHost).to.equal('user@login.cluster.edu');
    });

    it('jump host from the CLI space form', () => {
        expect(Config.from(['--jump-host', 'user@login.cluster.edu'], EMPTY_ENV).jumpHost).to.equal('user@login.cluster.edu');
    });

    it('jump host from env', () => {
        expect(Config.from([], envOf({ [Config.ENV_JUMP_HOST]: 'user@login.cluster.edu' })).jumpHost).to.equal('user@login.cluster.edu');
    });

    it('jump host from the CLI overrides env', () => {
        expect(Config.from(['--jump-host=cli-login'], envOf({ [Config.ENV_JUMP_HOST]: 'env-login' })).jumpHost).to.equal('cli-login');
    });
});
