import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.gen.ts',
      '**/src/paraglide/**',
      '**/.tanstack/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '.specify/**',
      '.claude/**',
      'specs/**',
      'document/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // A package is used only through its public entry point, never through its internals.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@kete/*/src/*', '@kete/*/src'],
              message: 'Import a package through its public entry point.',
            },
            {
              group: ['@/features/*/*', '!@/features/*/index', '!@/features/*/client'],
              message:
                'Import a feature through its public entry points (index.ts; client.ts in screens).',
            },
          ],
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
