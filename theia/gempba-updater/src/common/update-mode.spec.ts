import { expect } from 'chai';
import { UpdateMode } from './update-mode';

describe('UpdateMode', () => {

    it('installs on Windows', () => {
        expect(UpdateMode.of('win32', undefined, false)).to.equal('install');
    });

    it('installs an AppImage, and leaves a deb or rpm to its package manager', () => {
        expect(UpdateMode.of('linux', '/home/user/gempba-dashboard-2.0.0-linux-x86_64.AppImage', false)).to.equal('install');
        expect(UpdateMode.of('linux', undefined, false)).to.equal('notice');
        expect(UpdateMode.of('linux', '', false)).to.equal('notice');
    });

    it('installs on macOS only with a Developer ID signature', () => {
        expect(UpdateMode.of('darwin', undefined, true)).to.equal('install');
        expect(UpdateMode.of('darwin', undefined, false)).to.equal('notice');
    });

    it('only notifies on any other platform', () => {
        expect(UpdateMode.of('freebsd', undefined, true)).to.equal('notice');
    });

    it('tells a Developer ID signature from an ad-hoc one or none', () => {
        const executable = 'Executable=/Applications/GemPBA Dashboard.app/Contents/MacOS/GemPBA Dashboard\n';
        const signed = `${executable}Authority=Developer ID Application: Andres Pastrana (AB12CD34EF)\nTeamIdentifier=AB12CD34EF\n`;
        const adHoc = `${executable}Signature=adhoc\nTeamIdentifier=not set\n`;
        const unsigned = '/Applications/GemPBA Dashboard.app: code object is not signed at all\n';
        expect(UpdateMode.hasDeveloperId(signed)).to.equal(true);
        expect(UpdateMode.hasDeveloperId(adHoc)).to.equal(false);
        expect(UpdateMode.hasDeveloperId(unsigned)).to.equal(false);
    });
});
