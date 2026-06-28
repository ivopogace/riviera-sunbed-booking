/**
 * Published command surface of the {@code availability} module (invariant #11) — the
 * {@link AvailabilityClaim} port and its {@link ClaimOutcome} result. Exposed as a Spring
 * Modulith named interface so the {@code booking} module (U3) can claim a {@code (set,
 * date)} without reaching into availability's {@code infrastructure.*}/{@code domain}
 * packages. The module is the sole writer of the {@code (set, date)} source of truth
 * (invariant #2).
 */
@org.springframework.modulith.NamedInterface("api")
package ai.riviera.platform.availability.api;
