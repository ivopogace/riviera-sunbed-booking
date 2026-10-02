// @ts-check
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');

const preferOutputOverStatusRole = require('./eslint-rules/prefer-output-over-status-role');

// Every feature folder under src/app/; a new one joins this list.
const FEATURES = ['admin', 'auth', 'booking', 'operator', 'venue'];

const FROZEN_CLOCK = {
  selector: "CallExpression[callee.object.name='vi'][callee.property.name='useRealTimers']",
  message:
    'Restore the frozen clock with freezeClock() from src/testing/freeze-clock; vi.useRealTimers() unfakes Date and leaves every later test in the file on the machine calendar (ADR-0014).',
};

const LOCAL_ZONE_DATE = {
  selector:
    'MemberExpression[property.name=/^(getDate|getDay|getMonth|getFullYear|getHours|getMinutes)$/]',
  message:
    "Local-zone Date getter: it reads the viewer's zone, and shared/booking-date.ts anchors civil days at UTC midnight. Use the getUTC* twin, or Intl with an explicit timeZone (invariant #6).",
};

/** The `no-restricted-syntax` bans on non-spec `src/app` code. */
const APP_SYNTAX = [FROZEN_CLOCK, LOCAL_ZONE_DATE];

/**
 * RV-FE-8's import direction (`riviera-frontend` § Folder taxonomy): `files` may not import from the
 * `banned` app folders, statically or through `import()`. `except` is a frozen edge: the one module
 * of a banned folder it may import. A block's `no-restricted-syntax` replaces the earlier ones, so it
 * repeats {@link APP_SYNTAX}.
 */
function importBoundary(files, banned, { except, ignores = [] } = {}) {
  const lookahead = (folder) => (except?.folder === folder ? `(?!${except.module}$)` : '');
  const bans = banned.map((folder) => ({
    regex: `^(?:\\.\\./)+${folder}/${lookahead(folder)}`,
    message: `RV-FE-8: this folder may not import ${folder}/. Promote the shared need (pure → shared/, stateful or HTTP → core/); see riviera-frontend § Folder taxonomy.`,
  }));
  return {
    files,
    ignores: ['**/*.spec.ts', ...ignores],
    rules: {
      'no-restricted-imports': ['error', { patterns: bans }],
      'no-restricted-syntax': [
        'error',
        ...APP_SYNTAX,
        ...bans.map(({ regex, message }) => ({
          selector: `ImportExpression[source.value=/${regex.replaceAll('/', '\\/')}/]`,
          message,
        })),
      ],
    },
  };
}

const OPERATOR_VENUE_EDGE = ['src/app/operator/console-venue-map.ts', 'src/app/operator/daily-view-tab.ts'];
const HOME_VENUE_EDGE = ['src/app/pages/home/home.ts'];
const VENUE_BOOKING_EDGE = ['src/app/venue/venue-map.ts'];
const others = (feature) => ['pages', ...FEATURES.filter((f) => f !== feature)];

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
      'no-restricted-syntax': ['error', FROZEN_CLOCK],
    },
  },
  {
    files: ['src/app/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...APP_SYNTAX],
    },
  },
  {
    // Inline templates reach this block too, extracted above — the surface Sonar cannot read.
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    plugins: { riviera: { rules: { 'prefer-output-over-status-role': preferOutputOverStatusRole } } },
    rules: { 'riviera/prefer-output-over-status-role': 'error' },
  },
  importBoundary(['src/app/shared/**/*.ts'], ['core', 'pages', ...FEATURES]),
  importBoundary(['src/app/core/**/*.ts'], ['pages', ...FEATURES]),
  importBoundary(['src/app/pages/**/*.ts'], FEATURES, { ignores: HOME_VENUE_EDGE }),
  importBoundary(HOME_VENUE_EDGE, FEATURES, { except: { folder: 'venue', module: 'venue\\.service' } }),
  importBoundary(['src/app/admin/**/*.ts'], others('admin')),
  importBoundary(['src/app/auth/**/*.ts'], others('auth')),
  importBoundary(['src/app/booking/**/*.ts'], others('booking')),
  importBoundary(['src/app/operator/**/*.ts'], others('operator'), { ignores: OPERATOR_VENUE_EDGE }),
  importBoundary(OPERATOR_VENUE_EDGE, others('operator'), { except: { folder: 'venue', module: 'venue\\.service' } }),
  importBoundary(['src/app/venue/**/*.ts'], others('venue'), { ignores: VENUE_BOOKING_EDGE }),
  importBoundary(VENUE_BOOKING_EDGE, others('venue'), { except: { folder: 'booking', module: 'booking-dialog' } }),
  {
    // Build tooling, outside every TS project: type-aware rules would only see `any`.
    files: ['playwright*.config.ts', 'vitest-base.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
]);
