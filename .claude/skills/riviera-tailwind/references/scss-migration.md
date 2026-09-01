# SCSS→Tailwind migration checklist

Read when a slice migrates a `.scss` file to Tailwind, including via the migrate-on-touch
rule (SKILL.md). There is no shared SCSS left (`shared/_glass.scss` is retired), so step 1
finds a shared recipe only if a new one has been added since.

1. Inventory the shared SCSS recipes the file uses and their blast radius (grep every
   `@include`/`@extend`). This decides scope.
2. Pick scope: **narrow** (leave shared recipes as SCSS, Tailwind only the file's own
   styles) or **full** (port the recipe to a directive/component and update every consumer).
   Ask the user when the recipe is widely shared — it changes the diff size a lot.
3. Retain test-hook classes (SKILL.md rule 2). A new shared primitive gets a `.spec.ts`; a
   composited or tinted surface (glass, scrim) gets a `*.contrast.spec.ts` that computes AA
   over the actual surface — worst-case gradient stops, then the alpha inks over that
   composite — with the `testing/glass-tokens.ts` helpers. The specs are pure maths.
4. Verify: `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e:a11y` (the CI-run
   mocked suite), plus the computed-style diff in SKILL.md's no-drift rule. Fix
   regressions; never retune a test to match one.
