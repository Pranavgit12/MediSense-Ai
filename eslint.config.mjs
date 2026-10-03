import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'data/generated/**',
      'src/database/migrations/**',
      'next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // The plugin must be registered under the exact name its rules reference.
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      // Unused args prefixed with `_` are intentional (interface conformance).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // The codebase prefers `unknown` + narrowing over `any`; `any` is allowed
      // only where a third-party type forces it.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  {
    // Build/dev/verification scripts are allowed to print progress.
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
