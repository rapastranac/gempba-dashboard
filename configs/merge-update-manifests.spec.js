const { expect } = require('chai');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { gather, mergeManifests } = require('./merge-update-manifests');

/** A latest-mac.yml as electron-builder writes it for one architecture. */
function macManifest(arch, version = '2.1.0') {
    return [
        `version: ${version}`,
        'files:',
        `  - url: gempba-dashboard-${version}-mac-${arch}.zip`,
        `    sha512: ${arch}zip==`,
        '    size: 100',
        `  - url: gempba-dashboard-${version}-mac-${arch}.dmg`,
        `    sha512: ${arch}dmg==`,
        '    size: 200',
        `path: gempba-dashboard-${version}-mac-${arch}.zip`,
        `sha512: ${arch}zip==`,
        "releaseDate: '2026-11-06T12:00:00.000Z'",
        ''
    ].join('\n');
}

describe('merge-update-manifests', () => {

    it('lists both architectures\' files in one manifest, keeping the rest of the first', () => {
        expect(mergeManifests([macManifest('arm64'), macManifest('x64')])).to.equal([
            'version: 2.1.0',
            'files:',
            '  - url: gempba-dashboard-2.1.0-mac-arm64.zip',
            '    sha512: arm64zip==',
            '    size: 100',
            '  - url: gempba-dashboard-2.1.0-mac-arm64.dmg',
            '    sha512: arm64dmg==',
            '    size: 200',
            '  - url: gempba-dashboard-2.1.0-mac-x64.zip',
            '    sha512: x64zip==',
            '    size: 100',
            '  - url: gempba-dashboard-2.1.0-mac-x64.dmg',
            '    sha512: x64dmg==',
            '    size: 200',
            'path: gempba-dashboard-2.1.0-mac-arm64.zip',
            'sha512: arm64zip==',
            "releaseDate: '2026-11-06T12:00:00.000Z'",
            ''
        ].join('\n'));
    });

    it('reads Windows line endings', () => {
        const merged = mergeManifests([macManifest('arm64').replace(/\n/g, '\r\n'), macManifest('x64')]);
        expect(merged).to.include('  - url: gempba-dashboard-2.1.0-mac-x64.zip\n');
        expect(merged).not.to.include('\r');
    });

    it('refuses manifests of different versions, or without a files list', () => {
        expect(() => mergeManifests([macManifest('arm64', '2.1.0'), macManifest('x64', '2.0.9')])).to.throw('different versions: 2.1.0, 2.0.9');
        expect(() => mergeManifests(['version: 2.1.0\n', macManifest('x64')])).to.throw('no files list');
    });

    describe('gather', () => {
        let root;

        beforeEach(() => {
            root = fs.mkdtempSync(path.join(os.tmpdir(), 'gempba-release-'));
        });

        afterEach(() => {
            fs.rmSync(root, { recursive: true, force: true });
        });

        function artifact(name, files) {
            fs.mkdirSync(path.join(root, 'artifacts', name), { recursive: true });
            for (const [file, content] of Object.entries(files)) {
                fs.writeFileSync(path.join(root, 'artifacts', name, file), content);
            }
        }

        it('copies every file into the release, merging the manifests that share a name', () => {
            artifact('gempba-dashboard-windows-x64', { 'latest.yml': 'version: 2.1.0\nfiles: []\n', 'gempba-dashboard-2.1.0-win-x64.exe': 'exe' });
            artifact('gempba-dashboard-macos-arm64', { 'latest-mac.yml': macManifest('arm64'), 'gempba-dashboard-2.1.0-mac-arm64.zip': 'zip' });
            artifact('gempba-dashboard-macos-x64', { 'latest-mac.yml': macManifest('x64'), 'gempba-dashboard-2.1.0-mac-x64.zip': 'zip' });
            const release = path.join(root, 'release');
            expect(gather(path.join(root, 'artifacts'), release)).to.deep.equal([
                'gempba-dashboard-2.1.0-mac-arm64.zip', 'gempba-dashboard-2.1.0-mac-x64.zip', 'gempba-dashboard-2.1.0-win-x64.exe', 'latest-mac.yml', 'latest.yml'
            ]);
            expect(fs.readFileSync(path.join(release, 'latest-mac.yml'), 'utf8')).to.equal(mergeManifests([macManifest('arm64'), macManifest('x64')]));
            expect(fs.readFileSync(path.join(release, 'gempba-dashboard-2.1.0-win-x64.exe'), 'utf8')).to.equal('exe');
        });

        it('refuses an installer that two builds both made', () => {
            artifact('a', { 'gempba-dashboard-2.1.0-mac-x64.zip': 'one' });
            artifact('b', { 'gempba-dashboard-2.1.0-mac-x64.zip': 'two' });
            expect(() => gather(path.join(root, 'artifacts'), path.join(root, 'release'))).to.throw('comes from more than one build');
        });
    });
});
