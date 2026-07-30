package ai.riviera.platform.booking.events;

import java.time.Instant;
import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * Published when a venue's acceptance of a Request-mode booking leaves the guest genuinely owing
 * money (#373, epic #367 story 14): the booking is {@code AWAITING_PAYMENT}, a PaymentIntent is
 * registered, and it will be swept away again at {@code payBy} unless the guest pays. Today's one
 * subscriber is {@code notification}, which mails the deadline.
 *
 * <p><strong>It is not "the request was accepted", and the difference is the whole design.</strong>
 * Three things can follow the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT} transition, and
 * only one of them owes anything:
 *
 * <ul>
 * <li>the {@code stripe}-profile gateway returns {@code Pending} — payment is outstanding, the
 *     verified webhook has not spoken (invariant #8), and this event is the fact;</li>
 * <li>the default-profile in-process stub returns {@code Succeeded} and the booking is
 *     {@code CONFIRMED} before the accept call returns, having collected nothing
 *     ({@code payment.api.CollectionGuarantee}) — nothing is due, and a "pay by" mail would
 *     contradict the confirmation mail landing beside it;</li>
 * <li>the PaymentIntent fails or throws and the booking is <em>reverted</em> to
 *     {@code PENDING_REQUEST} — nothing is due and there is no way to pay it.</li>
 * </ul>
 *
 * <p>The accept transaction commits <em>before</em> any of that is known (no lock is held across the
 * Stripe call), so an event raised there would fire on all three. This one is raised afterwards, on
 * the first branch only, from {@code booking.application.request.PaymentDueAnnouncer} — which exists
 * to give the Event Publication Registry a commit to persist the publication on.
 *
 * <p>Id-based, immutable payload (invariant #11): technical ids ({@link BookingId}, {@link VenueId},
 * {@link SetId}) plus the facts fixed at the accept — the {@code bookingDate} ({@code LocalDate} in
 * {@code Europe/Tirane}, invariant #6), the gross {@code amountMinor} in integer minor units + ISO
 * {@code currency} (invariant #5), and {@code payBy}, the UTC instant at which the abandoned sweep's
 * accepted arm begins expiring this booking ({@code accepted_at + booking.request.pay-window}, both
 * sides derived from {@code RequestWindows} so the promise and the enforcement cannot drift).
 *
 * <p><strong>The booking code is deliberately absent</strong>, as on every published payload here:
 * the registry serializes events into {@code event_publication} as text and retains them under
 * archive completion mode, so carrying the arrival credential would persist it in cleartext
 * (invariant #7). The subscriber reads it at send time through {@code booking.api}.
 */
public record BookingPaymentDue(BookingId bookingId, VenueId venueId, SetId setId,
		LocalDate bookingDate, Instant payBy, long amountMinor, String currency) {
}
