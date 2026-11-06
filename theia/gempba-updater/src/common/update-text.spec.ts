import { expect } from 'chai';
import { UpdateText } from './update-text';

function updaterError(message: string, code?: string): Error {
    return Object.assign(new Error(message), code ? { code } : {});
}

describe('UpdateText', () => {

    it('words each step with the app and the version', () => {
        expect(UpdateText.available('GemPBA Dashboard', '2.1.0')).to.equal('GemPBA Dashboard 2.1.0 is available.');
        expect(UpdateText.availableFromPage('GemPBA Dashboard', '2.1.0')).to.equal('GemPBA Dashboard 2.1.0 is available. Download it from the release page.');
        expect(UpdateText.downloading('GemPBA Dashboard', '2.1.0')).to.equal('Downloading GemPBA Dashboard 2.1.0');
        expect(UpdateText.ready('GemPBA Dashboard', '2.1.0')).to.equal('GemPBA Dashboard 2.1.0 is ready to install.');
        expect(UpdateText.upToDate('GemPBA Dashboard', '2.0.0')).to.equal('GemPBA Dashboard 2.0.0 is up to date.');
        expect(UpdateText.checkFailed('no network connection')).to.equal("Couldn't check for updates: no network connection.");
        expect(UpdateText.downloadFailed('no network connection')).to.equal("Couldn't download the update: no network connection.");
    });

    it('shows the download in whole percent, within 0 to 100', () => {
        expect(UpdateText.progress(45.97)).to.equal('45 %');
        expect(UpdateText.progress(100)).to.equal('100 %');
        expect(UpdateText.progress(-3)).to.equal('0 %');
        expect(UpdateText.progress(100.4)).to.equal('100 %');
    });

    it('says a release without update information in plain words', () => {
        const url = 'https://github.com/rapastranac/gempba-dashboard/releases/download/v1.0.0/latest.yml';
        const message = `Cannot find latest.yml in the latest release artifacts (${url}): HttpError: 404 \n"method: GET"\nHeaders: {}`;
        const error = updaterError(message, 'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND');
        expect(UpdateText.reason(error)).to.equal('the latest release has no update information');
        expect(UpdateText.reason(updaterError('No published versions on GitHub', 'ERR_UPDATER_NO_PUBLISHED_VERSIONS'))).to.equal('no release was found');
    });

    it('tells being offline from a server that cannot be reached', () => {
        expect(UpdateText.reason(updaterError('net::ERR_INTERNET_DISCONNECTED'))).to.equal('no network connection');
        expect(UpdateText.reason(updaterError('getaddrinfo ENOTFOUND github.com'))).to.equal('no network connection');
        expect(UpdateText.reason(updaterError('net::ERR_CONNECTION_REFUSED'))).to.equal("the update server can't be reached");
        expect(UpdateText.reason(updaterError('connect ETIMEDOUT 140.82.112.3:443'))).to.equal("the update server can't be reached");
    });

    it('keeps the first line of any other failure, shortened', () => {
        expect(UpdateText.reason(updaterError('sha512 checksum mismatch.\nexpected abc, got def'))).to.equal('sha512 checksum mismatch');
        expect(UpdateText.reason(updaterError('x'.repeat(300)))).to.have.length(120);
        expect(UpdateText.reason('plain text')).to.equal('plain text');
        expect(UpdateText.reason(updaterError(''))).to.equal('unknown error');
    });
});
