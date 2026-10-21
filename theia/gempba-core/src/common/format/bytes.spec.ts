import { expect } from 'chai';
import { Bytes } from './bytes';

describe('Bytes', () => {

    it('below a kibibyte is plain bytes', () => {
        expect(Bytes.human(0)).to.equal('0 B');
        expect(Bytes.human(512)).to.equal('512 B');
        expect(Bytes.human(1023)).to.equal('1023 B');
    });

    it('scales through binary suffixes with one decimal', () => {
        expect(Bytes.human(1024)).to.equal('1.0 KB');
        expect(Bytes.human(1536)).to.equal('1.5 KB');
        expect(Bytes.human(1024 * 1024)).to.equal('1.0 MB');
        expect(Bytes.human(3 * 1024 ** 3)).to.equal('3.0 GB');
        expect(Bytes.human(1024 ** 4)).to.equal('1.0 TB');
    });

    it('saturates at terabytes', () => {
        expect(Bytes.human(5 * 1024 ** 4)).to.equal('5.0 TB');
        expect(Bytes.human(2048 * 1024 ** 4)).to.match(/ TB$/);
    });
});
