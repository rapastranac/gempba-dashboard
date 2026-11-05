import { expect } from 'chai';
import * as net from 'net';
import { RefreshInterval } from '@gempba/core';
import { BroadcastEnvelope, ControlKind, ControlLine } from '../protocol/wire-protocol';
import { MockEmitter } from './mock-emitter';

function frame(seq: number): BroadcastEnvelope {
    return {
        version: 1, ts: 0, elapsed_seconds: seq,
        ranks: [{
            rank: 0, seq_no: seq, rank_local_ms: 0, tasks_started_total: 0, tasks_sent_total: 0, tasks_recv_total: 0,
            tasks_running: 0, scheduler_pending_count: 0, idle_microseconds_per_thread: 0, process_cpu_pct: 0,
            process_rss_bytes: 0, process_threads: 1, edges_out: []
        }],
        nodes: [{
            sentinel_rank: 0, sentinel_local_ms: 0, hostname: 'h', socket_count: 1, logical_cores: 1,
            mem_total_bytes: 0, mem_avail_bytes: 0, cgroup_mem_used_bytes: 0, cgroup_mem_limit_bytes: 0
        }]
    };
}

/** A raw socket reader collecting every line the emitter sends. */
class Reader {
    readonly socket: net.Socket;
    readonly lines: BroadcastEnvelope[] = [];
    protected buffered = '';

    constructor(port: number) {
        this.socket = net.createConnection({ host: '127.0.0.1', port });
        this.socket.setEncoding('utf8');
        this.socket.on('data', (chunk: string) => {
            this.buffered += chunk;
            const parts = this.buffered.split('\n');
            this.buffered = parts.pop()!;
            parts.forEach(line => this.lines.push(BroadcastEnvelope.parse(line)));
        });
    }

    async waitFor(count: number, timeoutMs = 1500): Promise<BroadcastEnvelope[]> {
        const deadline = Date.now() + timeoutMs;
        while (this.lines.length < count) {
            if (Date.now() > deadline) {
                throw new Error(`expected ${count} lines, got ${this.lines.length}`);
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return this.lines;
    }
}

describe('MockEmitter', () => {

    let emitter: MockEmitter | undefined;
    let reader: Reader | undefined;

    afterEach(async () => {
        reader?.socket.destroy();
        reader = undefined;
        await emitter?.close();
        emitter = undefined;
    });

    async function connect(created: MockEmitter): Promise<Reader> {
        emitter = created;
        reader = new Reader(await created.listen());
        return reader;
    }

    it('replays the recording from its first frame and loops at the end', async () => {
        const lines = await (await connect(new MockEmitter({ frames: [frame(1), frame(2)], workerIntervalMs: 50 }))).waitFor(3);
        expect(lines.slice(0, 3).map(line => line.ranks![0].seq_no)).to.deep.equal([1, 2, 1]);
    });

    it('stamps each frame with the current time', async () => {
        const before = Date.now();
        const [first] = await (await connect(new MockEmitter({ frames: [frame(1)] }))).waitFor(1);
        expect(first.ts).to.be.at.least(before);
    });

    it('keeps node frames only on node ticks', async () => {
        const created = new MockEmitter({ frames: [frame(1)], workerIntervalMs: 50, nodeIntervalMs: 10_000 });
        const lines = await (await connect(created)).waitFor(2);
        expect(lines[0].nodes).to.have.lengthOf(1);
        expect(lines[1].nodes).to.deep.equal([]);
    });

    it('applies control lines clamped to the server bounds and ignores malformed ones', async () => {
        const applied: [ControlKind, number][] = [];
        const created = new MockEmitter({ frames: [frame(1)], onControl: (kind, ms) => applied.push([kind, ms]) });
        const client = await connect(created);
        await client.waitFor(1);

        client.socket.write('garbage\n' + ControlLine.format(ControlKind.SetWorkerIntervalMs, 10)
            + ControlLine.format(ControlKind.SetNodeIntervalMs, 2500));
        const deadline = Date.now() + 1500;
        while (applied.length < 2 && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        expect(applied).to.deep.equal([[ControlKind.SetWorkerIntervalMs, RefreshInterval.MIN_MS], [ControlKind.SetNodeIntervalMs, 2500]]);
        expect(created.workerIntervalMs).to.equal(RefreshInterval.MIN_MS);
        expect(created.nodeIntervalMs).to.equal(2500);
    });

    it('defaults to gempba\'s cadence', () => {
        const created = new MockEmitter({ frames: [frame(1)] });
        expect([created.workerIntervalMs, created.nodeIntervalMs]).to.deep.equal([RefreshInterval.DEFAULT_MS, RefreshInterval.DEFAULT_NODE_MS]);
    });

    it('loads the canned recording', () => {
        const frames = MockEmitter.load(MockEmitter.DEFAULT_FIXTURE);
        expect(frames).to.have.lengthOf(3);
        expect(frames[0].topology?.identities).to.have.lengthOf(3);
    });
});
