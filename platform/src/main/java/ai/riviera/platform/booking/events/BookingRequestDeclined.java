package ai.riviera.platform.booking.events;

import java.time.LocalDate;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * A venue declined a pending Request-to-Book: the guarded
 * {@code PENDING_REQUEST → DECLINED} transition committed and the {@code (set, date)} soft-hold was
 * released. Published from inside {@code RequestReleaseService}'s decline leg — the one transaction
 * in which the outcome is settled — so the Event Publication Registry row commits atomically with
 * the transition, unlike {@link BookingPaymentDue}, whose accept-branch outcome is only decided
 * after its transaction by the gateway's answer.
 *
 * <p>Ids and the booking's date only (invariant #11). No {@code venueId}: the sole subscriber is
 * {@code notification}, which re-reads the venue name through its facts resolver — there is no
 * payout or money consequence here (nothing accrued, nothing collected), which is also why this is
 * its own fact and not a {@code BookingCancelled}, an event that carries refund/reversal semantics
 * to three subscribers. {@code bookingDate} rides along because the mail renders it and the
 * resolver does not return it. Never the booking code — the registry persists
 * payloads in cleartext (invariant #7).
 *
 * <p>The withdraw leg beside decline publishes <strong>no</strong> counterpart, deliberately:
 * the guest retracted the request themselves, so there is no outcome to notify them of.
 */
public record BookingRequestDeclined(BookingId bookingId, SetId setId, LocalDate bookingDate) {
}
