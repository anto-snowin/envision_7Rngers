/**
 * ESLint flat configuration (ESLint 9/10).
 */
const globals = require('globals');
const prettier = require('eslint-config-prettier');

module.exports = [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    rules: {
      // Correctness
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-shadow': 'warn',
      'no-return-await': 'error',
      'no-await-in-loop': 'off', // intentional for ordered location replay
      // Returning a promise from an async wrapper is idiomatic here.
      'require-await': 'off',
      'consistent-return': 'off',

      // Style handled by Prettier; keep only what it cannot express.
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'warn',
      // Long alert messages are assembled from several concatenated lines,
      // which stays readable in a way a multi-line template literal does not
      // (a template literal would bake the indentation into the string).
      'prefer-template': 'off',

      // The logger is the only sanctioned console user.
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    // The seeder and the logger print to the terminal by design.
    files: ['src/jobs/**/*.js', 'src/utils/logger.js'],
    rules: { 'no-console': 'off' },
  },
  prettier,
];
