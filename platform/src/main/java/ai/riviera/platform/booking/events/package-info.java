/**
 * Published <strong>events</strong> of the {@code booking} module (invariant #11)
 * — {@link BookingConfirmed} and {@link BookingCancelled}, the write-side spine facts other
 * modules react to (U5/U6): {@code payout} accrues on confirmation and posts a reversal on
 * cancellation; and {@link BookingPaymentDue}, which is a fact about a booking rather
 * than about the spine — an accepted Request-mode booking now owes money by a deadline — and whose
 * only subscriber is {@code notification}. Id-based, immutable payloads only.
 * Listener modules are granted {@code booking::events} (+ {@code booking::vocabulary} for the
 * ids the payloads carry), never a command surface.
 */
@org.springframework.modulith.NamedInterface("events")
package ai.riviera.platform.booking.events;
