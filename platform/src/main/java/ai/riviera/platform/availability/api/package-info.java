/**
 * Published <strong>ports</strong> surface of the {@code availability} module (invariant
 * #11) — the {@link AvailabilityClaim} "call-me" port only; its {@code ClaimOutcome} result
 * lives in the sibling {@code vocabulary} named interface (issue #95). Exposed as a Spring
 * Modulith named interface so the {@code booking} module (U3) can claim a {@code (set,
 * date)} without reaching into availability's {@code application.*}/{@code adapter.*}
 * packages. The module is the sole writer of the {@code (set, date)} source of truth
 * (invariant #2).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.availability.api;
