# SCSS→Tailwind migration checklist

1. Inventory shared SCSS recipes the file uses (`@include`/`@extend`) and their blast radius.
2. Pick scope: **narrow** (Tailwind only the file's own styles) or **full** (port the recipe
   to a directive/component and update every consumer). Ask the user when widely shared.
3. Retain test-hook classes (SKILL.md rule 2). A new shared primitive gets a `.spec.ts`; a
   composited/tinted surface gets a `*.contrast.spec.ts` computing AA over worst-case gradient
   stops with the `testing/glass-tokens.ts` helpers.
4. Verify: `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e:a11y`, plus the
   computed-style diff (SKILL.md no-drift rule). Never retune a test to match a regression.
