import { parseArgs } from 'util';
import { ConnectionMode } from '@gempba/core';
import { MockConfig, MockShape } from '../common/mock-config';
import { MockStatus } from '../common/mock-protocol';
import { MockRun } from './sim/mock-run';
import { MockService } from './mock-service';

/**
 * `npm run mock`: the built-in mocker without the app, for an installed dashboard or a script. Flags override the
 * defaults; `--bench` times frames instead of serving them.
 */
const USAGE = `Usage: npm run mock -- [options]
  --mode local|host|jump   how the dashboard reaches the mock (local)
  --port N                 the gempba port (9000)
  --ssh-port N             the SSH port in host and jump modes (2222)
  --key system|generated   which public keys the SSH server accepts (system)
  --mfa CODE               ask for this passcode after the key
  --nodes N                nodes behind the login node, in jump mode (2); local and host run one
  --sockets N --cores N --smt --ranks N --pool N --mem GiB --cgroup GiB
  --scenario steady|slow|ramp|imbalanced|bursty
  --scheduler semi-centralized|centralized
  --load PCT --fidelity gempba|full --seed N
  --bench                  time building and serializing frames, then exit`;

const { values } = parseArgs({
    options: {
        mode: { type: 'string' }, port: { type: 'string' }, 'ssh-port': { type: 'string' }, key: { type: 'string' }, mfa: { type: 'string' },
        nodes: { type: 'string' }, sockets: { type: 'string' }, cores: { type: 'string' }, smt: { type: 'boolean' }, ranks: { type: 'string' },
        pool: { type: 'string' }, mem: { type: 'string' }, cgroup: { type: 'string' }, scenario: { type: 'string' },
        scheduler: { type: 'string' }, load: { type: 'string' }, fidelity: { type: 'string' }, seed: { type: 'string' }, bench: { type: 'boolean' },
        help: { type: 'boolean' }
    }
});

if (values.help) {
    console.log(USAGE);
    process.exit(0);
}

const defaults = MockConfig.defaults();
const number = (text: string | undefined, fallback: number) => text === undefined ? fallback : Number(text);
const shape: MockShape = {
    nodes: number(values.nodes, defaults.shape.nodes),
    socketsPerNode: number(values.sockets, defaults.shape.socketsPerNode),
    coresPerSocket: number(values.cores, defaults.shape.coresPerSocket),
    smt: values.smt ?? defaults.shape.smt,
    ranksPerNode: number(values.ranks, defaults.shape.ranksPerNode),
    poolThreads: number(values.pool, defaults.shape.poolThreads),
    memPerNodeGiB: number(values.mem, defaults.shape.memPerNodeGiB),
    cgroupGiB: number(values.cgroup, defaults.shape.cgroupGiB)
};
const config: MockConfig = {
    access: {
        mode: choice(values.mode?.toUpperCase(), Object.values(ConnectionMode), defaults.access.mode, '--mode'),
        gempbaPort: number(values.port, defaults.access.gempbaPort),
        sshPort: number(values['ssh-port'], defaults.access.sshPort),
        keySource: choice(values.key, MockConfig.KEY_SOURCES, defaults.access.keySource, '--key'),
        mfa: values.mfa !== undefined,
        mfaCode: values.mfa ?? defaults.access.mfaCode
    },
    shape,
    scheduler: choice(values.scheduler, MockConfig.SCHEDULERS, defaults.scheduler, '--scheduler'),
    live: {
        scenario: choice(values.scenario, MockConfig.SCENARIOS, defaults.live.scenario, '--scenario'),
        loadPct: number(values.load, defaults.live.loadPct),
        fidelity: choice(values.fidelity, MockConfig.FIDELITIES, defaults.live.fidelity, '--fidelity')
    },
    seed: number(values.seed, defaults.seed)
};
if (values.nodes !== undefined && !values.bench && config.access.mode !== ConnectionMode.JUMP) {
    fail('--nodes needs --mode jump: Local is this machine and Host one VM, each a single node');
}
// a bench times the whole cluster typed, whatever the mode
const problems = MockConfig.problems(values.bench ? { ...config, access: { ...config.access, mode: ConnectionMode.JUMP } } : config);
if (problems.length > 0) {
    fail(problems.join('\n'));
}

if (values.bench) {
    bench(config);
} else {
    serve(config);
}

/** Builds and serializes a minute of frames at the worker rate after a minute's warm-up, and reports the cost of one. */
function bench({ shape: benchShape, scheduler, live, seed }: MockConfig): void {
    const run = new MockRun(benchShape, scheduler, live, seed, { workerIntervalMs: 50, nodeIntervalMs: 1000 });
    run.advanceTo(60_000);
    const frames = 1200;
    let bytes = 0;
    const started = process.hrtime.bigint();
    for (let i = 1; i <= frames; i++) {
        run.advanceTo(60_000 + i * 50);
        bytes += run.line(Date.now()).length;
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6 / frames;
    console.log(`${benchShape.nodes} nodes × ${benchShape.ranksPerNode} workers, ${live.fidelity} fidelity: ${ms.toFixed(2)} ms a frame, `
        + `${Math.round(bytes / frames / 1024)} KiB a line`);
}

function serve(served: MockConfig): void {
    const service = new MockService(undefined, false);
    service.addClient({ onStatus: () => undefined, onLog: line => console.log(line.message) });
    service.start(served).then(status => {
        const reach = status.reach!;
        console.log(MockStatus.summary(status));
        if (reach.mode !== ConnectionMode.LOCAL) {
            console.log(`Connect to ${reach.sshHost} on SSH port ${reach.sshPort}${reach.sshKey ? ` with the key ${reach.sshKey}` : ''}`
                + `${reach.targetHost ? `, then listen to ${reach.targetHost}` : ''} on gempba port ${reach.gempbaPort}; host key ${reach.hostKeyFingerprint}`);
        }
        console.log('Ctrl+C stops it.');
    }, error => fail(error instanceof Error ? error.message : String(error)));
    process.on('SIGINT', () => service.dispose().then(() => process.exit(0)));
}

function choice<T>(value: string | undefined, choices: readonly T[], fallback: T, flag: string): T {
    if (value === undefined) {
        return fallback;
    }
    const found = choices.find(each => String(each).toLowerCase() === value.toLowerCase());
    if (found === undefined) {
        fail(`${flag} takes one of ${choices.map(each => String(each).toLowerCase()).join(', ')}`);
    }
    return found!;
}

function fail(message: string): never {
    console.error(`${message}\n\n${USAGE}`);
    process.exit(1);
}
