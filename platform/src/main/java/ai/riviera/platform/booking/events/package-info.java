/**
 * Published <strong>events</strong> of the {@code booking} module (invariant #11): the spine facts
 * {@link BookingConfirmed} and {@link BookingCancelled} ({@code payout} accrues on confirmation and
 * reverses on cancellation), and the mail-only facts {@link StayConfirmed}, {@link StayCancelled},
 * {@link BookingPaymentDue}, {@link BookingRequestDeclined}, {@link BookingRequestExpired},
 * {@link BookingMoved} and {@link StayMoveDue}. Id-based, immutable payloads only. Listeners are granted {@code booking::events}
 * (+ {@code ::vocabulary} for the ids), never a command surface.
 */
@org.springframework.modulith.NamedInterface("events")
package ai.riviera.platform.booking.events;
