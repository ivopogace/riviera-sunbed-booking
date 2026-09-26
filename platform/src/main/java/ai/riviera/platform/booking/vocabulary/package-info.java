/**
 * Published <strong>vocabulary</strong> of the {@code booking} module (invariant #11): value types
 * such as the {@link BookingId} typed id, the {@link RefundReason} on {@code BookingCancelled}
 * (ADR-0005), {@link OnlineTakings} and {@link BookingNotificationInfo} returned by the {@code api}
 * query ports, and the {@link CancellationWindow} phases. Command services stay internal in
 * {@code application/}; query ports live in {@code api}, events in {@code events}. Granted as
 * {@code booking::vocabulary} to consumers per least privilege.
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.booking.vocabulary;
