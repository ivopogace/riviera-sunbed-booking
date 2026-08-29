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
    },
  },
  {
    // Components augmenting a native element are camelCase-attribute-selected, like a directive.
    files: [
      'src/app/admin/admin-forbidden.ts',
      'src/app/booking/cancellation-terms-note.ts',
      'src/app/booking/legal-consent.ts',
      'src/app/shared/legal-footer.ts',
    ],
    rules: {
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='vi'][callee.property.name='useRealTimers']",
          message:
            'Restore the frozen clock with freezeClock() from src/testing/freeze-clock; vi.useRealTimers() unfakes Date and leaves every later test in the file on the machine calendar (ADR-0014).',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  {
    // Build tooling, outside every TS project: type-aware rules would only see `any`.
    files: ['playwright*.config.ts', 'vitest-base.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
