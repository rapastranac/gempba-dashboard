const fs = require('fs');
const path = require('path');

/**
 * Which @gempba packages each package may depend on. Any package not listed is a feature: it may use only the
 * kernel, the telemetry hub and the UI kit, never another feature. The app is the composition root and may list
 * anything.
 */
const ALLOWED = {
    '@gempba/core': [],
    '@gempba/telemetry': ['@gempba/core'],
    '@gempba/shell': [],
    '@gempba/plugins': ['@gempba/shell'],
    '@gempba/ui': [],
    '@gempba/electron-app': '*'
};
const FEATURE_ALLOWED = ['@gempba/core', '@gempba/telemetry', '@gempba/ui'];
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * @param {{ name: string, [field: string]: unknown }[]} packages parsed package.json files
 * @returns {string[]} one message per forbidden dependency
 */
function findViolations(packages) {
    const violations = [];
    for (const pkg of packages) {
        const allowed = ALLOWED[pkg.name] ?? FEATURE_ALLOWED;
        if (allowed === '*') {
            continue;
        }
        for (const field of DEPENDENCY_FIELDS) {
            for (const dependency of Object.keys(pkg[field] ?? {})) {
                if (dependency.startsWith('@gempba/') && !allowed.includes(dependency)) {
                    violations.push(`${pkg.name} must not depend on ${dependency} (${field})`);
                }
            }
        }
    }
    return violations;
}

/** @param {string} root the repository root */
function readPackages(root) {
    const theia = path.join(root, 'theia');
    return fs.readdirSync(theia)
        .map(dir => path.join(theia, dir, 'package.json'))
        .filter(file => fs.existsSync(file))
        .map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = { findViolations, readPackages };

if (require.main === module) {
    const violations = findViolations(readPackages(path.resolve(__dirname, '..')));
    if (violations.length > 0) {
        console.error('Layering violations (see "How extensions connect" in ARCHITECTURE.md):');
        violations.forEach(violation => console.error(`  ${violation}`));
        process.exit(1);
    }
    console.log('Layering check passed.');
}
