/**
 * Published <strong>vocabulary</strong> of the {@code availability} module (invariant #11,
 * issue #95) — {@link ClaimOutcome}, the typed outcome the {@code AvailabilityClaim} port
 * returns (a lost claim race is expected flow, not an exception). Value types only — the
 * claim port itself lives in the sibling {@code api} named interface. Granted as
 * {@code availability::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.availability.vocabulary;
