/**
 * Published <strong>vocabulary</strong> of the {@code operator} module (invariant #11, issue
 * #95) — the typed ids ({@link OperatorId}, {@link VenueRef}), the {@link OperatorCredential}
 * value, and {@link NotVenueOwnerException} (the invariant-#13 ownership-mismatch signal a
 * caller maps to {@code 403}). Value types only, never ports — "call-me" interfaces live in
 * the sibling {@code api} named interface. Granted as {@code operator::vocabulary} to
 * consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.operator.vocabulary;
