/**
 * Published <strong>events</strong> of the {@code booking} module (invariant #11, issue #95)
 * — {@link BookingConfirmed} and {@link BookingCancelled}, the write-side spine facts other
 * modules react to (U5/U6): {@code payout} accrues on confirmation and posts a reversal on
 * cancellation. Id-based, immutable payloads only. This is the whole surface {@code payout}
 * needs — the module publishes no ports, so there is no {@code booking.api} package at all;
 * listener modules are granted {@code booking::events} (+ {@code booking::vocabulary} for the
 * ids the payloads carry), never a command surface.
 */
@org.springframework.modulith.NamedInterface("events")
package ai.riviera.platform.booking.events;
