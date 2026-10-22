const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const built = new Set();

/**
 * Lets the IDE run a `src/**\/*.spec.ts` file directly by loading its compiled twin from `lib/` instead.
 * The debugger then maps it back to the source through the on-disk `.js.map`; WebStorm does not map
 * in-memory output such as ts-node's. The package is built first so `lib/` never runs stale code.
 */
require.extensions['.ts'] = (module, filename) => {
    const packageDir = findPackageDir(filename);
    build(packageDir);
    const relative = path.relative(path.join(packageDir, 'src'), filename);
    const compiled = path.join(packageDir, 'lib', relative.replace(/\.ts$/, '.js'));
    if (relative.startsWith('..') || !fs.existsSync(compiled)) {
        throw new Error(`No compiled output for ${filename}`);
    }
    module.exports = require(compiled);
};

function findPackageDir(filename) {
    let dir = path.dirname(filename);
    while (!fs.existsSync(path.join(dir, 'tsconfig.json'))) {
        const parent = path.dirname(dir);
        if (parent === dir) {
            throw new Error(`No tsconfig.json above ${filename}`);
        }
        dir = parent;
    }
    return dir;
}

function build(packageDir) {
    if (built.has(packageDir)) {
        return;
    }
    try {
        execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-b', packageDir], { stdio: 'pipe' });
    } catch (error) {
        throw new Error(`Compilation failed for ${packageDir}\n${error.stdout}${error.stderr}`);
    }
    built.add(packageDir);
}
