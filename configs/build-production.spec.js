const { expect } = require('chai');
const path = require('path');
const { withoutDevExtensions } = require('./build-production');

describe('build-production', () => {

    it('drops the development-only extensions from the app\'s dependencies, and leaves the package as it was', () => {
        const app = { name: 'app', gempbaDevExtensions: ['@gempba/mock'], dependencies: { '@gempba/grid': '2.0.0', '@gempba/mock': '2.0.0' } };
        expect(withoutDevExtensions(app)).to.deep.equal({ ...app, dependencies: { '@gempba/grid': '2.0.0' } });
        expect(app.dependencies).to.have.property('@gempba/mock');
    });

    it('keeps every dependency when none is development-only', () => {
        expect(withoutDevExtensions({ dependencies: { '@gempba/grid': '2.0.0' } }).dependencies).to.deep.equal({ '@gempba/grid': '2.0.0' });
    });

    it('covers the mocker in the real app', () => {
        const app = require(path.resolve(__dirname, '..', 'theia', 'electron-app', 'package.json'));
        expect(app.gempbaDevExtensions).to.include('@gempba/mock');
        expect(withoutDevExtensions(app).dependencies).not.to.have.property('@gempba/mock');
        expect(app.scripts.package).to.contain('build-production.js');
    });
});
