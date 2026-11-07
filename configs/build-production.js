// Builds the app's production bundle without its development-only extensions, the ones its package.json lists under
// gempbaDevExtensions, such as the built-in mocker. Theia collects extensions from the app's dependencies, so they are
// dropped from those in memory before the build reads them; no file is edited.
// Usage, from theia/electron-app: node ../../configs/build-production.js

/**
 * The app package without its development-only extensions among its dependencies.
 * @param {{ dependencies?: Record<string, string>, gempbaDevExtensions?: string[], [field: string]: unknown }} pkg a parsed package.json
 */
function withoutDevExtensions(pkg) {
    const dev = pkg.gempbaDevExtensions ?? [];
    return { ...pkg, dependencies: Object.fromEntries(Object.entries(pkg.dependencies ?? {}).filter(([name]) => !dev.includes(name))) };
}

module.exports = { withoutDevExtensions };

if (require.main === module) {
    const { ApplicationPackageManager } = require('@theia/application-manager');
    const manager = new ApplicationPackageManager({ projectPath: process.cwd(), appTarget: 'electron' });
    // the parsed package.json, read once and kept: the extensions are collected from it on first use, which is the build
    const pkg = manager.pck.pck;
    const dropped = (pkg.gempbaDevExtensions ?? []).filter(name => name in (pkg.dependencies ?? {}));
    pkg.dependencies = withoutDevExtensions(pkg).dependencies;
    console.log(`Production build without the development-only ${dropped.length > 0 ? dropped.join(', ') : 'extensions (none listed)'}.`);
    manager.build(['--mode', 'production'], { mode: 'production' }).catch(error => {
        console.error(error);
        process.exit(1);
    });
}
