import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Structural accessibility audit for component specs (issue #38). Runs axe-core over a
 * rendered host element and fails the test on any **critical or serious** violation.
 *
 * Two rules are deliberately disabled:
 *  - `color-contrast` — axe needs real layout/rendering to measure contrast; under jsdom
 *    it can only return "incomplete", never a true pass/fail. Contrast is instead
 *    guaranteed deterministically by `venue-map.contrast.spec.ts` (issue #38, AC-4).
 *  - `region` — a single component rendered in isolation is a DOM fragment, not a full
 *    page, so the "all content in a landmark" rule does not apply at this scope.
 *
 * axe needs the node attached to the document to resolve relationships (e.g.
 * `aria-labelledby`), so the host is appended to `document.body` for the run and removed
 * afterwards.
 */
const AUDIT_CONFIG: axe.RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
  },
};

export async function expectNoAxeViolations(host: HTMLElement): Promise<void> {
  document.body.appendChild(host);
  try {
    const results = await axe.run(host, AUDIT_CONFIG);
    const blocking = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking, formatViolations(blocking)).toEqual([]);
  } finally {
    host.remove();
  }
}

/** Human-readable summary used as the assertion message when a violation is found. */
function formatViolations(violations: readonly axe.Result[]): string {
  if (violations.length === 0) {
    return 'No accessibility violations';
  }
  return violations
    .map((v) => {
      const targets = v.nodes.map((n) => n.target.join(' ')).join(', ');
      return `[${v.impact}] ${v.id}: ${v.help} (${targets})\n  ${v.helpUrl}`;
    })
    .join('\n');
}
