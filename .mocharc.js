const path = require('path');

module.exports = {
    require: [path.join(__dirname, 'configs', 'mocha-compiled-specs.js')],
    // Node 22 would otherwise load .ts files itself, bypassing the compiled-spec loader.
    'node-option': ['no-experimental-strip-types', 'enable-source-maps']
};
