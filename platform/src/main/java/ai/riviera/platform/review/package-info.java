/**
 * Review bounded context — the tourist's verdict on a delivered stay: the review record (stars,
 * comment and display name; one per booking), the eligibility and 60-day window policy, the
 * author's own submit/edit/delete lifecycle inside it, and the aggregate rating math.
 * Aggregate root: {@code Review}.
 *
 * <p><strong>Leaf module, deny-by-default:</strong> {@code allowedDependencies = { "shared" }},
 * the {@code operator}/{@code customer} posture — everything points <em>into</em> this module.
 * The two facts it needs from elsewhere both arrive by inversion rather than by an outbound edge:
 * whether a booking was checked in comes through {@link ai.riviera.platform.review.spi.CompletedStays},
 * a driven port {@code booking} implements (the {@code customer.spi.GuestBookingHistory} precedent),
 * and the recomputed aggregate reaches {@code venue} as {@link ai.riviera.platform.review.events.ReviewsChanged},
 * whose listener queries back through {@link ai.riviera.platform.review.api.VenueRatingSummary}. Calling
 * {@code booking::api} directly would close the cycle {@code venue → review → booking → venue}, since
 * {@code booking} already depends on {@code venue}; a {@code BookingCompleted} event would close the same
 * one. Rationale: ADR-0015.
 *
 * <p>It publishes its own {@link ai.riviera.platform.review.vocabulary.VenueRef} and
 * {@link ai.riviera.platform.review.vocabulary.BookingRef} typed ids (invariant #11) for the same
 * reason {@code operator} does — reusing {@code venue}'s or {@code booking}'s id types would re-add
 * the edge the leaf posture exists to avoid.
 *
 * <p>Full-module layout (ADR-0007): {@code api} + {@code spi} + {@code vocabulary} + {@code events}
 * + {@code application} + {@code domain} + {@code adapter.in} + {@code adapter.out}. It never writes
 * the {@code venue} table — it computes the aggregate, {@code venue} stores it.
 */
@org.springframework.modulith.ApplicationModule(
	displayName = "Review",
	allowedDependencies = { "shared" }
)
package ai.riviera.platform.review;
