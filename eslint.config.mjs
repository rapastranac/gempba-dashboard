// The repository's code style, after Theia's own (theia/configs/errors.eslintrc.json): the style rules and the cheap
// correctness rules, without Theia's checks of its own codebase (license headers, localization). Indentation is left
// to the editor and .editorconfig, as in Theia. Run with `npm run lint`; `npm test` and CI run it too.
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';

const style = {
    '@stylistic/arrow-parens': ['error', 'as-needed'],
    '@stylistic/brace-style': ['error', '1tbs', { allowSingleLine: true }],
    '@stylistic/comma-spacing': 'error',
    '@stylistic/eol-last': 'error',
    '@stylistic/jsx-quotes': ['error', 'prefer-single'],
    '@stylistic/keyword-spacing': 'error',
    '@stylistic/max-len': ['error', { code: 180 }],
    '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
    '@stylistic/no-tabs': 'error',
    '@stylistic/no-trailing-spaces': 'error',
    '@stylistic/object-curly-spacing': ['error', 'always'],
    '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
    '@stylistic/semi': ['error', 'always'],
    '@stylistic/semi-spacing': 'error',
    '@stylistic/space-before-blocks': 'error',
    '@stylistic/space-before-function-paren': ['error', { anonymous: 'always', named: 'never', asyncArrow: 'always' }],
    '@stylistic/space-infix-ops': 'error',
    '@stylistic/spaced-comment': ['error', 'always', { exceptions: ['*', '+', '-', '/'] }],
    'arrow-body-style': ['error', 'as-needed'],
    'curly': 'error',
    'eqeqeq': ['error', 'smart'],
    'guard-for-in': 'error',
    'no-duplicate-imports': 'error',
    'no-new-wrappers': 'error',
    'no-shadow-restricted-names': 'error',
    'no-throw-literal': 'error',
    'no-unreachable': 'error',
    'no-unused-expressions': 'error',
    'no-var': 'error',
    'one-var': ['error', 'never'],
    'prefer-const': ['error', { destructuring: 'all', ignoreReadBeforeAssign: true }]
};

export default tseslint.config(
    {
        ignores: ['**/node_modules/**', '**/lib/**', '**/src-gen/**', '**/gen-webpack*.js', '.browser_modules/**', 'theia/electron-app/**']
    },
    {
        files: ['**/*.js', '**/*.mjs'],
        plugins: { '@stylistic': stylistic },
        rules: style
    },
    {
        files: ['theia/*/src/**/*.ts', 'theia/*/src/**/*.tsx'],
        languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { '@stylistic': stylistic, '@typescript-eslint': tseslint.plugin },
        rules: {
            ...style,
            '@stylistic/type-annotation-spacing': 'error',
            '@typescript-eslint/consistent-type-definitions': 'error',
            '@typescript-eslint/no-explicit-any': 'error'
        }
    },
    {
        // chai's property assertions, e.g. `expect(ok).to.be.true`, are bare expressions.
        files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.spec.js'],
        rules: { 'no-unused-expressions': 'off' }
    }
);
