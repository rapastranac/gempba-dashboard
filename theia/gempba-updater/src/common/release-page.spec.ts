import { expect } from 'chai';
import { ReleasePage } from './release-page';

describe('ReleasePage', () => {

    it('links to the release on GitHub', () => {
        const config = 'owner: rapastranac\nrepo: gempba-dashboard\nprovider: github\nreleaseType: release\nupdaterCacheDirName: gempba-dashboard-updater\n';
        expect(ReleasePage.of(config, '2.1.0')).to.equal('https://github.com/rapastranac/gempba-dashboard/releases/tag/v2.1.0');
    });

    it('reads quoted values', () => {
        expect(ReleasePage.of('provider: \'github\'\nowner: "rapastranac"\nrepo: gempba-dashboard\n', '2.1.0'))
            .to.equal('https://github.com/rapastranac/gempba-dashboard/releases/tag/v2.1.0');
    });

    it('has no page for another provider or an incomplete configuration', () => {
        expect(ReleasePage.of('provider: generic\nurl: http://127.0.0.1:8123/\n', '2.1.0')).to.equal(undefined);
        expect(ReleasePage.of('provider: github\nowner: rapastranac\n', '2.1.0')).to.equal(undefined);
        expect(ReleasePage.of('', '2.1.0')).to.equal(undefined);
    });
});
