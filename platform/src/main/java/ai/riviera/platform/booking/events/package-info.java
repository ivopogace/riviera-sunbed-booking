/**
 * Published <strong>events</strong> of the {@code booking} module (invariant #11): the spine facts
 * {@link BookingConfirmed} and {@link BookingCancelled} ({@code payout} accrues on confirmation and
 * reverses on cancellation), and the mail-only facts {@link BookingPaymentDue},
 * {@link BookingRequestDeclined}, {@link BookingRequestExpired} and {@link BookingMoved}. Id-based,
 * immutable payloads only. Listener modules are granted {@code booking::events} (+
 * {@code booking::vocabulary} for the ids the payloads carry), never a command surface.
 */
@org.springframework.modulith.NamedInterface("events")
package ai.riviera.platform.booking.events;
