/**
 * ESLint flat configuration for the React frontend.
 */
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}'],

    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2023,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },

    plugins: {
      react,
      'react-hooks': reactHooks,
    },

    settings: {
      react: { version: 'detect' },
    },

    rules: {
      // Correctness
      eqeqeq: ['error', 'smart'],
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'no-undef': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      // The logger-free frontend uses console only in the error boundary.
      'no-console': ['warn', { allow: ['error', 'warn'] }],

      // React
      ...react.configs.flat.recommended.rules,
      // The new JSX transform means React need not be in scope.
      'react/react-in-jsx-scope': 'off',
      // Prop types are not used in this codebase; JSDoc documents the shapes.
      'react/prop-types': 'off',

      // Hooks — these catch real bugs, so they stay errors.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
