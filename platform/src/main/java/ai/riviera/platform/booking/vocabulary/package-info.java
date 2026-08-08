/**
 * Published <strong>vocabulary</strong> of the {@code booking} module (invariant #11) — the
 * {@link BookingId} typed id, the {@link RefundReason} carried by
 * {@code BookingCancelled} (policy vs weather, ADR-0005), {@link OnlineTakings} returned by
 * the {@code api/DailyTakings} query port, and {@link BookingNotificationInfo} returned by
 * the {@code api/BookingNotificationFacts} query port. Value types only — the module's
 * command services stay internal in {@code application/}; the published query ports live in the
 * sibling {@code api} named interface and published events in {@code events}. Granted as
 * {@code booking::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.booking.vocabulary;
