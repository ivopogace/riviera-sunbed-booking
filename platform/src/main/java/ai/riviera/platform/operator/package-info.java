/**
 * The operator module: operator accounts and the operator↔venue ownership mapping. It answers
 * <em>"does this operator own this venue?"</em> for every venue-scoped application service (#13:
 * {@code 403} on a mismatch) and <em>"does this venue have an {@code ACTIVE} owner?"</em>, the
 * tourist-visibility fence ({@link ai.riviera.platform.operator.api.VenueVisibility}). It depends on
 * nothing, not even {@code venue}: its own {@link ai.riviera.platform.operator.vocabulary.VenueRef}
 * (#11) keeps that edge acyclic. Login stays at the platform edge, never in here.
 */
@org.springframework.modulith.ApplicationModule(
    displayName = "Operator",
    allowedDependencies = {}
)
package ai.riviera.platform.operator;
