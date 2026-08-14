// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

module.exports = defineConfig([
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: __dirname },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/test-setup', '**/test-setup.*'],
              message:
                'src/test-setup.ts must stay un-imported: a second importer makes esbuild hoist its body into a shared chunk, and the clock freeze then runs once per Vitest worker instead of once per test file (#663). Import freezeClock from src/testing/freeze-clock instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name='useRealTimers']",
          message:
            'Restore the frozen clock with freezeClock() from src/testing/freeze-clock; vi.useRealTimers() unfakes Date and leaves the rest of the file on the machine calendar (#663).',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
  {
    // Build tooling, outside every TS project: type-aware rules would only see `any`.
    files: ['playwright*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
