import { parseArgs } from 'util';
import { MockEmitter } from './mock-emitter';

const { values } = parseArgs({
    options: {
        port: { type: 'string', default: '9000' },
        fixture: { type: 'string', default: MockEmitter.DEFAULT_FIXTURE },
        'worker-interval-ms': { type: 'string' },
        'node-interval-ms': { type: 'string' }
    }
});

const emitter = new MockEmitter({
    frames: MockEmitter.load(values.fixture),
    workerIntervalMs: optionalNumber(values['worker-interval-ms']),
    nodeIntervalMs: optionalNumber(values['node-interval-ms']),
    onControl: (kind, appliedMs) => console.log(`${kind} -> ${appliedMs} ms`)
});

emitter.listen(Number(values.port)).then(port => {
    console.log(`gempba mock emitter on 127.0.0.1:${port}, replaying ${values.fixture}`);
}, error => {
    console.error(`cannot listen on port ${values.port}: ${error.message}`);
    process.exitCode = 1;
});

function optionalNumber(value: string | undefined): number | undefined {
    return value === undefined ? undefined : Number(value);
}
