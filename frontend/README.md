# Frontend

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.0.4.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Accessibility audit

Accessibility is machine-checked, not just reviewed by eye (issue #38). The checks are
ordinary Vitest specs, so they run as part of `ng test` / `npm run test:coverage` (and
therefore in CI). To run only the a11y checks:

```bash
npm run test:a11y
```

This covers two things:

- **Structural audit (`*.a11y.spec.ts`)** — runs [axe-core](https://github.com/dequelabs/axe-core)
  over each rendered component (the beach map in its loaded / loading / error states, and
  the home page) and fails on any critical or serious violation.
- **WCAG-AA contrast (`venue-map.contrast.spec.ts`)** — checks the contrast ratio of the
  beach-map design tokens by relative-luminance maths. axe's own `color-contrast` rule
  can't run under jsdom (it needs real rendering), so the colour pairs the map uses are
  asserted deterministically instead. The token table mirrors `venue-map.scss`: change a
  colour there and you must re-pass AA here.

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
