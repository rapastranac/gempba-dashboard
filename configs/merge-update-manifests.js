// Gathers the package jobs' artifacts into the files of one GitHub Release. macOS arm64 and x64 package on separate
// runners, and each writes a latest-mac.yml that lists only its own zip and dmg; the release gets one latest-mac.yml
// listing both, from which electron-updater picks the file for the Mac's CPU. Every other file is copied as it is.
// Usage: node configs/merge-update-manifests.js <artifacts dir, one folder per artifact> <release dir>

const fs = require('fs');
const path = require('path');

const MANIFEST = /^latest.*\.yml$/;

/**
 * Where a manifest's `files:` list is. electron-builder writes it as `files:` followed by indented `- url:` entries.
 * @param {string} text a latest*.yml
 */
function filesList(text) {
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const start = lines.indexOf('files:');
    if (start < 0) {
        throw new Error('a manifest has no files list');
    }
    let end = start + 1;
    while (end < lines.length && /^\s/.test(lines[end])) {
        end++;
    }
    return { lines, start, end, version: /^version:\s*(\S+)/m.exec(text)?.[1] };
}

/**
 * The first manifest, with every other one's files listed after its own; the rest of it (the version, the release
 * date, and the older `path` and `sha512` fields) stays the first one's.
 * @param {string[]} manifests the texts of the manifests that share a name, one per build
 */
function mergeManifests(manifests) {
    const lists = manifests.map(filesList);
    const versions = [...new Set(lists.map(list => list.version))];
    if (versions.length > 1) {
        throw new Error(`the manifests are for different versions: ${versions.join(', ')}`);
    }
    const [first, ...others] = lists;
    return [
        ...first.lines.slice(0, first.end),
        ...others.flatMap(list => list.lines.slice(list.start + 1, list.end)),
        ...first.lines.slice(first.end)
    ].join('\n');
}

/**
 * Copies every artifact's files into the release folder, merging the manifests that share a name.
 * @param {string} artifactsDir one folder per artifact, as actions/download-artifact leaves them
 * @param {string} releaseDir the release's files, flat
 * @returns {string[]} the release's file names
 */
function gather(artifactsDir, releaseDir) {
    const byName = new Map();
    for (const artifact of fs.readdirSync(artifactsDir, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
        for (const name of fs.readdirSync(path.join(artifactsDir, artifact.name))) {
            byName.set(name, [...byName.get(name) ?? [], path.join(artifactsDir, artifact.name, name)]);
        }
    }
    fs.mkdirSync(releaseDir, { recursive: true });
    for (const [name, files] of byName) {
        const target = path.join(releaseDir, name);
        if (files.length === 1) {
            fs.copyFileSync(files[0], target);
        } else if (MANIFEST.test(name)) {
            fs.writeFileSync(target, mergeManifests(files.map(file => fs.readFileSync(file, 'utf8'))));
        } else {
            throw new Error(`${name} comes from more than one build: ${files.join(', ')}`);
        }
    }
    return [...byName.keys()].sort();
}

module.exports = { mergeManifests, gather };

if (require.main === module) {
    const [artifactsDir, releaseDir] = process.argv.slice(2);
    if (!artifactsDir || !releaseDir) {
        console.error('usage: node configs/merge-update-manifests.js <artifacts dir> <release dir>');
        process.exit(2);
    }
    gather(artifactsDir, releaseDir).forEach(name => console.log(name));
}
