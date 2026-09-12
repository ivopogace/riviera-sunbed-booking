'use strict';

const { getTemplateParserServices } = require('@angular-eslint/utils');

/**
 * Prefers the native `<output>` element over `role="status"` on a live region.
 *
 * The two are the same thing to assistive technology — `<output>`'s implicit ARIA role IS
 * `status` — so this rule buys consistency and analysis, not accessibility. It exists because
 * Sonar's `Web:S6819` reads `.html` files only and cannot see an inline `template:` literal,
 * which is where most of this app's live regions live. ESLint can: `processInlineTemplates`
 * extracts each inline template into a virtual `.html` file, which the config's HTML block
 * already covers, so one rule holds both halves of the tree to one idiom.
 *
 * <p>Two shapes legitimately keep `role="status"`, and both say so at the site with an
 * `<!-- eslint-disable-next-line -->`: a region whose content is not phrasing (`<output>` permits
 * phrasing content only, so a wrapper around a `<p>` cannot become one), and a region that
 * reports persistent state rather than the result of an action, which is the case `<output>`
 * describes. A door that forces a written reason is the point — a rule with a silent allowance
 * would leave the same split it was written to remove.
 *
 * <p>The report points at the element's open tag rather than the `role` attribute, because a
 * multi-line open tag has no line a disable comment could sit above: an HTML comment cannot go
 * inside an attribute list. It is also the more useful anchor — the element is what changes.
 *
 * <p>Not fixable on purpose. `<output>` is `display: inline` where the `<p>` it replaces was
 * block, so a correct edit often has to add a `block` class as well; a fixer that renamed the tag
 * alone would collapse margins and `min-height` with no diff to read.
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        '[Accessibility] Prefers the native `<output>` element over a `role="status"` live region',
    },
    schema: [],
    messages: {
      preferOutput:
        'Use the native <output> element instead of role="status" — its implicit ARIA role is already `status`. Add a `block` class if the region is visible, since <output> is display: inline. If this region cannot be an <output> (its content is not phrasing content, or it reports persistent state rather than the result of an action), keep the role behind an eslint-disable comment naming which.',
    },
  },
  create(context) {
    const parserServices = getTemplateParserServices(context);

    const isStatusRole = (attribute) =>
      attribute.name === 'role' &&
      (attribute.value === 'status' || attribute.value?.ast?.value === 'status');

    return {
      Element(node) {
        const attributes = [...(node.attributes ?? []), ...(node.inputs ?? [])];
        if (!attributes.some(isStatusRole)) {
          return;
        }
        context.report({
          loc: parserServices.convertNodeSourceSpanToLoc(node.startSourceSpan ?? node.sourceSpan),
          messageId: 'preferOutput',
        });
      },
    };
  },
};
