import { expect } from 'chai';
import { CenterQueue } from './center-queue';
import { MockRandom } from './mock-random';

describe('CenterQueue', () => {

    it('hands out the biggest subtree first, and counts the tasks and bytes it holds', () => {
        const queue = new CenterQueue();
        [5, 50, 1, 20].forEach(tasks => queue.push({ tasks, bytes: 1024 }));
        expect(queue.length).to.equal(4);
        expect(queue.bytes).to.equal(4096);
        expect([queue.pop(), queue.pop(), queue.pop(), queue.pop()].map(task => task!.tasks)).to.deep.equal([50, 20, 5, 1]);
        expect(queue.pop()).to.equal(undefined);
        expect(queue.bytes).to.equal(0);
    });

    it('stays ordered through many pushes and pops', () => {
        const random = new MockRandom(9);
        const queue = new CenterQueue();
        const popped: number[] = [];
        for (let i = 0; i < 2000; i++) {
            queue.push({ tasks: random.int(1, 1_000_000), bytes: 1 });
            if (i % 3 === 0) {
                queue.pop();
            }
        }
        while (queue.length > 0) {
            popped.push(queue.pop()!.tasks);
        }
        expect(popped).to.deep.equal([...popped].sort((a, b) => b - a));
    });
});
