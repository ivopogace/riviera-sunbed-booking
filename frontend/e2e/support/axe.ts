import AxeBuilder from '@axe-core/playwright';
import { expect, Page } from '@playwright/test';

/**
 * The one real-render axe audit policy for the e2e suites (extracted at the #134 review —
 * previously copy-pasted per spec): WCAG 2.0/2.1 A+AA tags, failing on serious/critical
 * violations. Change the policy here and every spec follows.
 */
export async function expectNoSeriousAxeViolations(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(blocking, `axe violations at: ${context}\n${JSON.stringify(blocking, null, 2)}`).toEqual(
    [],
  );
}
