/**
 * Published <strong>vocabulary</strong> of the {@code review} module (invariant #11) — the typed ids
 * this module publishes rather than borrows ({@link VenueRef}, {@link BookingRef}), the values its
 * ports speak in ({@link RatingSummary}, {@link CompletedStay}), and the closed answer sets
 * ({@link ReviewState}, {@link SubmitOutcome}). Value types only, never ports — "call-me" interfaces
 * live in the sibling {@code api} named interface, "implement-me" ones in {@code spi}. Granted as
 * {@code review::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.review.vocabulary;
