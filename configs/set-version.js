const fs = require('fs');
const path = require('path');

const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * The package with this version, and with every @gempba dependency pinned to it: the workspace packages pin each
 * other exactly, which `npm version` leaves alone.
 * @param {{ version?: string, [field: string]: unknown }} pkg a parsed package.json
 * @param {string} version e.g. 2.1.0
 */
function withVersion(pkg, version) {
    const updated = { ...pkg, version };
    for (const field of DEPENDENCY_FIELDS) {
        if (pkg[field]) {
            updated[field] = Object.fromEntries(Object.entries(pkg[field]).map(([name, range]) => [name, name.startsWith('@gempba/') ? version : range]));
        }
    }
    return updated;
}

/** @param {string} root the repository root */
function packageFiles(root) {
    const theia = path.join(root, 'theia');
    return [path.join(root, 'package.json'), ...fs.readdirSync(theia)
        .map(dir => path.join(theia, dir, 'package.json'))
        .filter(file => fs.existsSync(file))];
}

module.exports = { withVersion, packageFiles };

if (require.main === module) {
    const version = process.argv[2];
    if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
        console.error('usage: node configs/set-version.js <major.minor.patch>, then npm install --package-lock-only');
        process.exit(2);
    }
    for (const file of packageFiles(path.resolve(__dirname, '..'))) {
        const raw = fs.readFileSync(file, 'utf8');
        const text = `${JSON.stringify(withVersion(JSON.parse(raw), version), undefined, 2)}\n`;
        fs.writeFileSync(file, raw.includes('\r\n') ? text.replace(/\n/g, '\r\n') : text);
    }
    console.log(`Set every package to ${version}.`);
}
