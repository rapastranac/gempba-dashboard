import { expect } from 'chai';
import { ConnectionMode } from '@gempba/core';
import { MockConfig, MockShape } from './mock-config';

describe('MockConfig', () => {

    const defaults = MockConfig.defaults();

    function withShape(shape: Partial<MockShape>): MockConfig {
        return { ...defaults, shape: { ...defaults.shape, ...shape } };
    }

    it('runs as it comes', () => {
        expect(MockConfig.problems(defaults)).to.deep.equal([]);
    });

    it('reads stored values, each field that is missing or of the wrong kind taking its default', () => {
        expect(MockConfig.of(undefined)).to.deep.equal(defaults);
        const read = MockConfig.of({
            access: { mode: 'JUMP', gempbaPort: '9001', mfa: true },
            shape: { nodes: 16, smt: 'yes' },
            live: { scenario: 'slow', fidelity: 'everything' },
            seed: 7
        });
        expect(read.access).to.deep.equal({ ...defaults.access, mode: ConnectionMode.JUMP, mfa: true });
        expect(read.shape).to.deep.equal({ ...defaults.shape, nodes: 16 });
        expect(read.live).to.deep.equal({ ...defaults.live, scenario: 'slow' });
        expect(read.seed).to.equal(7);
    });

    it('reads the ranks per node of a run saved before they were called ranks', () => {
        expect(MockConfig.of({ shape: { workersPerNode: 6 } }).shape.ranksPerNode).to.equal(6);
        expect(MockConfig.of({ shape: { ranksPerNode: 3, workersPerNode: 6 } }).shape.ranksPerNode).to.equal(3);
    });

    it('checks the ports, and the SSH ones only when SSH is used', () => {
        expect(MockConfig.problems({ ...defaults, access: { ...defaults.access, gempbaPort: 70000 } }))
            .to.deep.equal(['The gempba port must be a whole number from 1 to 65535.']);
        const clash = { ...defaults.access, sshPort: 9000 };
        expect(MockConfig.problems({ ...defaults, access: clash })).to.deep.equal([]);
        expect(MockConfig.problems({ ...defaults, access: { ...clash, mode: ConnectionMode.HOST, mfa: true, mfaCode: ' ' } }))
            .to.deep.equal(['The SSH port must differ from the gempba port.', 'MFA needs a passcode.']);
    });

    it('keeps the shape within its bounds', () => {
        expect(MockConfig.problems(withShape({ coresPerSocket: 0, poolThreads: 2.5 }))).to.deep.equal([
            'Cores per socket must be a whole number from 1 to 128.',
            'Pool threads must be a whole number from 0 to 256.'
        ]);
        expect(MockConfig.problems(withShape({ cgroupGiB: 65 }))).to.deep.equal(['The cgroup limit cannot exceed the memory per node.']);
    });

    it('needs the coordinator and at least one worker, and no more ranks than gempba handles', () => {
        const jump = (shape: Partial<MockShape>) => ({ ...withShape(shape), access: { ...defaults.access, mode: ConnectionMode.JUMP } });
        expect(MockConfig.problems(withShape({ ranksPerNode: 1 })))
            .to.deep.equal(['The cluster needs from 2 to 4096 ranks in all: the coordinator and at least one worker; it has 1.']);
        expect(MockConfig.problems(jump({ nodes: 64, ranksPerNode: 128 }))).to.have.lengthOf(1);
        expect(MockConfig.problems(jump({ nodes: 16, ranksPerNode: 256 }))).to.deep.equal([]);
    });

    it('runs one node in Local and Host, this machine or the VM, and the cluster typed only in Jump', () => {
        const shape = { ...defaults.shape, nodes: 16 };
        const reached = (mode: ConnectionMode) => MockConfig.shapeOf({ ...defaults, shape, access: { ...defaults.access, mode } });
        expect(reached(ConnectionMode.LOCAL)).to.deep.equal({ ...shape, nodes: 1 });
        expect(reached(ConnectionMode.HOST).nodes).to.equal(1);
        expect(reached(ConnectionMode.JUMP).nodes).to.equal(16);
        expect(MockConfig.problems(withShape({ nodes: 0 })), 'a node count only Jump uses').to.deep.equal([]);
    });

    it('checks the load and the seed', () => {
        expect(MockConfig.problems({ ...defaults, live: { ...defaults.live, loadPct: 101 }, seed: 1.5 }))
            .to.deep.equal(['The load must be from 0 to 100 %.', 'The seed must be a whole number.']);
    });
});

describe('MockShape', () => {

    it('counts ranks and logical CPUs', () => {
        const shape = { ...MockConfig.defaults().shape, smt: true };
        expect(MockShape.totalRanks(shape)).to.equal(8);
        expect(MockShape.logicalPerSocket(shape)).to.equal(16);
    });
});
