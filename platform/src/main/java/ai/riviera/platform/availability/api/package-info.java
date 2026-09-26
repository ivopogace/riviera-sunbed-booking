/**
 * Published <strong>ports</strong> surface of the {@code availability} module (invariant #11):
 * {@link AvailabilityClaim}, the "call-me" claim port whose {@code ClaimOutcome} lives in the
 * sibling {@code vocabulary} named interface, and {@link SetAvailabilityFacts}, the taken-days read
 * a dated read model composes over. Consumers reach neither availability's {@code application.*}
 * nor {@code adapter.*} packages. The module is the sole writer of the {@code (set, date)} source
 * of truth (invariant #2).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.availability.api;
