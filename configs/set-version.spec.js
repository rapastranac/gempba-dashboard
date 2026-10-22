const { expect } = require('chai');
const path = require('path');
const { packageFiles, withVersion } = require('./set-version');

describe('set-version', () => {

    it('sets the version and pins every @gempba dependency to it, in any dependency field', () => {
        const cards = {
            name: '@gempba/cards', version: '2.0.0',
            dependencies: { '@gempba/core': '2.0.0', '@theia/core': '1.76.0' },
            devDependencies: { '@gempba/telemetry': '2.0.0', 'tslib': '^2.8.1' }
        };
        expect(withVersion(cards, '2.1.0')).to.deep.equal({
            name: '@gempba/cards', version: '2.1.0',
            dependencies: { '@gempba/core': '2.1.0', '@theia/core': '1.76.0' },
            devDependencies: { '@gempba/telemetry': '2.1.0', 'tslib': '^2.8.1' }
        });
    });

    it('keeps the order of a package\'s fields', () => {
        const pkg = { name: 'x', version: '1.0.0', private: true, dependencies: {} };
        expect(Object.keys(withVersion(pkg, '1.0.1'))).to.deep.equal(['name', 'version', 'private', 'dependencies']);
    });

    it('covers the root and every theia package', () => {
        const files = packageFiles(path.resolve(__dirname, '..')).map(file => path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/'));
        expect(files[0]).to.equal('package.json');
        expect(files).to.include('theia/electron-app/package.json');
        expect(files).to.include('theia/gempba-core/package.json');
    });
});
