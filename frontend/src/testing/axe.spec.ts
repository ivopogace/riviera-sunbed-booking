import { expectNoAxeViolations } from './axe';

/**
 * Proves the axe harness is not a no-op (issue #38, AC-1): a deliberately inaccessible
 * DOM must make `expectNoAxeViolations` fail. Without this, a passing component audit
 * could just mean the audit never checks anything.
 */
describe('expectNoAxeViolations', () => {
  it('rejects a host containing a serious violation (image without alt text)', async () => {
    const bad = document.createElement('div');
    bad.innerHTML = '<img src="beach.jpg">'; // missing alt → axe `image-alt` (critical)
    await expect(expectNoAxeViolations(bad)).rejects.toThrow();
  });

  it('passes a host with no violations', async () => {
    const good = document.createElement('div');
    good.innerHTML = '<img src="beach.jpg" alt="Sunbeds on the beach">';
    await expect(expectNoAxeViolations(good)).resolves.toBeUndefined();
  });
});
