'use strict';

const { getTemplateParserServices } = require('@angular-eslint/utils');

/**
 * Reports `role="status"` on an element that could be a native `<output>`, whose implicit ARIA role
 * is already `status`. Reaches inline `template:` literals as well as `.html` files — the half
 * Sonar's own `Web:S6819` cannot read, which is why the tree carried two idioms.
 *
 * <p>Reports at the open tag rather than the `role` attribute: a multi-line open tag has no line an
 * `<!-- eslint-disable-next-line -->` could sit above. Two shapes legitimately keep the role and use
 * that door — one whose content is not phrasing content, and one reporting standing state rather
 * than the result of an action.
 *
 * <p>No fixer: `<output>` is `display: inline` where the `<p>` it replaces was block, so a correct
 * edit usually adds a class the fixer could not know. Not reached: an interpolated `role="{{ … }}"`,
 * whose conditional forms are not statically decidable — the three literal forms are judged exactly
 * and the rest is stated rather than half-covered.
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
