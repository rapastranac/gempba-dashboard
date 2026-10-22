const { expect } = require('chai');
const path = require('path');
const { findViolations, readPackages } = require('./check-layers');

describe('check-layers', () => {

    it('passes on the repository as it is', () => {
        expect(findViolations(readPackages(path.resolve(__dirname, '..')))).to.deep.equal([]);
    });

    it('lets a feature use the kernel and the telemetry hub', () => {
        const grid = { name: '@gempba/grid', dependencies: { '@gempba/core': '2.0.0', '@gempba/telemetry': '2.0.0', '@theia/core': '1.76.0' } };
        expect(findViolations([grid])).to.deep.equal([]);
    });

    it('rejects a feature depending on another feature, in any dependency field', () => {
        const cards = { name: '@gempba/cards', dependencies: { '@gempba/grid': '2.0.0' }, devDependencies: { '@gempba/auth': '2.0.0' } };
        expect(findViolations([cards])).to.deep.equal([
            '@gempba/cards must not depend on @gempba/grid (dependencies)',
            '@gempba/cards must not depend on @gempba/auth (devDependencies)'
        ]);
    });

    it('keeps the kernel, the hub and the shell free of features', () => {
        const packages = [
            { name: '@gempba/core', dependencies: { '@gempba/telemetry': '2.0.0' } },
            { name: '@gempba/telemetry', dependencies: { '@gempba/core': '2.0.0', '@gempba/auth': '2.0.0' } },
            { name: '@gempba/shell', dependencies: { '@gempba/core': '2.0.0' } }
        ];
        expect(findViolations(packages)).to.deep.equal([
            '@gempba/core must not depend on @gempba/telemetry (dependencies)',
            '@gempba/telemetry must not depend on @gempba/auth (dependencies)',
            '@gempba/shell must not depend on @gempba/core (dependencies)'
        ]);
    });

    it('lets the app compose anything', () => {
        const app = { name: '@gempba/electron-app', dependencies: { '@gempba/shell': '2.0.0', '@gempba/grid': '2.0.0' } };
        expect(findViolations([app])).to.deep.equal([]);
    });
});
