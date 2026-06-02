import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import noRawFormInputs from './eslint-rules/no-raw-form-inputs.js';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', 'apps/api/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['components/forms/**/*.{ts,tsx}', 'components/pos/**/*.{ts,tsx}'],
    plugins: {
      ifms: { rules: { 'no-raw-form-inputs': noRawFormInputs } },
    },
    rules: {
      'ifms/no-raw-form-inputs': 'warn',
    },
  },
];
