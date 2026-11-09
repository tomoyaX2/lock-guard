import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const HTML_SINK = 'Page-controlled text must never be parsed as HTML; use textContent.';

const sharedRules = {
  'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  complexity: ['error', 10],
  'max-depth': ['error', 3],
  'max-params': ['error', 3],
  curly: ['error', 'all'],
  eqeqeq: 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  'no-empty': 'error',
  'no-eval': 'error',
  'no-new-func': 'error',
  'no-console': 'error',
  'no-restricted-properties': [
    'error',
    { property: 'innerHTML', message: HTML_SINK },
    { property: 'outerHTML', message: HTML_SINK },
    { property: 'insertAdjacentHTML', message: HTML_SINK },
    { object: 'document', property: 'write', message: HTML_SINK },
  ],
};

const typeScriptRules = {
  'no-shadow': 'off',
  '@typescript-eslint/no-shadow': 'error',
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
  // node:test awaits the promise test() returns itself, so ignoring it is correct there.
  '@typescript-eslint/no-floating-promises': [
    'error',
    { allowForKnownSafeCalls: [{ from: 'package', name: 'test', package: 'node:test' }] },
  ],
  '@typescript-eslint/no-misused-promises': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
};

export default defineConfig(
  { ignores: ['node_modules/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: typeScriptRules,
  },
  { files: ['eslint.config.js'], languageOptions: { globals: globals.node } },
  prettier,
  { rules: sharedRules },
);
