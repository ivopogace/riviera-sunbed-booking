package ai.riviera.platform.payment.vocabulary;

/**
 * An opaque reference to the venue a collection pays, carried as a technical id (invariant #11): the
 * {@code payment} module does not import the {@code venue} module's types. Provider adapters that
 * pay the venue's own account use it to pick that account (ADR-0029).
 */
public record PayeeRef(long value) {
}
