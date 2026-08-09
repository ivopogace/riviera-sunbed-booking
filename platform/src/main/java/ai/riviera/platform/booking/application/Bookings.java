package ai.riviera.platform.booking.application;

import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.reserve.NewBooking;
import ai.riviera.platform.booking.application.refund.RefundableBooking;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmedBooking;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.application.view.DailyBooking;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's outbound persistence port (driven seam). Keeping the SQL out of the
 * use case lets the branch logic be unit-tested with a fake. Implemented by {@code JdbcBookings}
 * (explicit SQL, invariant #1).
 */
public interface Bookings {

	/**
	 * Insert a new booking in {@code AWAITING_PAYMENT}, returning its generated id, or {@code empty} if
	 * the {@code code} already exists (an atomic {@code INSERT … ON CONFLICT (code) DO NOTHING} against
	 * invariant #7's {@code UNIQUE(code)}). Empty is the caller's signal to regenerate the code and
	 * retry — a normal flow that does <strong>not</strong> abort the surrounding transaction, which a
	 * thrown unique violation would. Other integrity failures (FK/CHECK) still throw.
	 */
	OptionalLong insertAwaitingPayment(NewBooking booking);

	/**
	 * Insert a new booking in {@code PENDING_REQUEST} with its venue-response deadline. Same
	 * code-collision contract as {@link #insertAwaitingPayment}. No payment exists yet — a
	 * PaymentIntent is created only if the venue accepts.
	 */
	OptionalLong insertPendingRequest(NewBooking booking, Instant requestExpiresAt);

	/**
	 * Accept a pending request: the guarded {@code PENDING_REQUEST → AWAITING_PAYMENT} transition,
	 * venue-scoped and deadline-guarded ({@code request_expires_at > now}), stamping
	 * {@code accepted_at = now} — the guest pay-window clock. Returns the accepted facts via SQL
	 * {@code RETURNING} iff a row actually transitioned; empty when the id is unknown at this venue, no
	 * longer pending, or past its deadline — the caller classifies via {@link #requestSnapshot}.
	 */
	Optional<ai.riviera.platform.booking.application.request.AcceptedRequest> acceptPendingRequest(
			long bookingId, VenueId venueId, Instant now);

	/**
	 * Compensate a failed payment-request issuance: the guarded {@code AWAITING_PAYMENT →
	 * PENDING_REQUEST} revert (clearing {@code accepted_at}), possible only because no PaymentIntent
	 * exists to race it. True iff a row reverted.
	 */
	boolean revertAcceptToPending(long bookingId);

	/**
	 * Decline a pending request: the guarded venue-scoped {@code PENDING_REQUEST → DECLINED} transition,
	 * returning the {@link ClaimRef} iff it transitioned so the caller releases the soft-hold exactly
	 * once (invariant #2). Deliberately NOT deadline-guarded — an expired-but-unswept request may still
	 * be declined: the same release, a different terminal label.
	 */
	Optional<ClaimRef> declinePending(long bookingId, VenueId venueId);

	/**
	 * The request-relevant state of a booking at this venue (status + deadline), or empty when the id is
	 * unknown <em>or belongs to another venue</em> — the venue-scoped read that lets accept/decline
	 * classify a missed transition without disclosing foreign bookings (invariant #13).
	 */
	Optional<ai.riviera.platform.booking.application.request.RequestSnapshot> requestSnapshot(
			long bookingId, VenueId venueId);

	/**
	 * The venue's {@code PENDING_REQUEST} bookings ordered by response deadline, most urgent first — the
	 * operator queue. Carries no booking code (invariant #7).
	 */
	List<ai.riviera.platform.booking.application.request.PendingRequestRow> findPendingRequestsForVenue(
			VenueId venueId);

	/**
	 * Load a booking by its {@code code} (the bearer credential, invariant #7) for the view and cancel
	 * use cases, or {@code empty} if no booking has that code. Read-only — carries the full row the
	 * caller needs without exposing the aggregate.
	 */
	Optional<BookingRecord> findByCode(String code);

	/**
	 * The bookings linked to a customer ACCOUNT, newest first — the signed-in "my bookings" list.
	 * Account-scoped by {@code account_id} (the session principal's id, never a request param — BOLA-safe,
	 * invariant #13 posture); a guest booking (NULL {@code account_id}) is never returned. Carries the
	 * raw rows the caller enriches with venue/set display via the {@code venue} api.
	 */
	List<BookingRecord> findByAccountId(CustomerAccountId accountId);

	/**
	 * Transition the booking to {@code CONFIRMED}, stamping {@code confirmed_at}, and return the
	 * confirmed facts for the {@code BookingConfirmed} payload, built atomically with the transition via
	 * SQL {@code RETURNING}. Strict: a non-{@code AWAITING_PAYMENT} row is an error — the synchronous
	 * stub path, where exactly-once is guaranteed within the create transaction.
	 */
	ConfirmedBooking confirm(long bookingId, Instant confirmedAt);

	/**
	 * Confirm from a signature-verified Stripe webhook: transition {@code AWAITING_PAYMENT → CONFIRMED}
	 * and return the confirmed facts. <strong>Idempotent</strong> — a 0-row update (already
	 * confirmed/cancelled, or a re-delivered event) yields {@code empty}, never an error. A present
	 * result means it actually transitioned, so the caller publishes exactly one
	 * {@code BookingConfirmed}.
	 */
	Optional<ConfirmedBooking> confirmFromPayment(long bookingId, Instant confirmedAt);

	/**
	 * Cancel from a verified {@code payment_intent.canceled} webhook: transition
	 * {@code AWAITING_PAYMENT → CANCELLED}. Returns the {@link ClaimRef} of the booking's
	 * {@code (set, date)} <strong>iff</strong> it actually transitioned, so the caller releases the
	 * availability claim exactly once (invariant #2); empty when it was no longer
	 * {@code AWAITING_PAYMENT}, and then nothing is released.
	 */
	Optional<ClaimRef> cancelAwaitingPayment(long bookingId);

	/**
	 * Cancel a confirmed booking: transition {@code CONFIRMED → CANCELLED}, stamping
	 * {@code cancelled_at}, the server-computed {@code refundMinor} and the {@code reason}, returning
	 * the facts for the refund + {@code BookingCancelled} payload via SQL {@code RETURNING}. The guarded
	 * {@code WHERE status = 'CONFIRMED'} makes a double-cancel a 0-row {@code empty} no-op, so the
	 * release, refund and event fire exactly once.
	 */
	Optional<CancelledBooking> cancelConfirmed(long bookingId, java.time.Instant cancelledAt,
			long refundMinor, ai.riviera.platform.booking.vocabulary.RefundReason reason);

	/**
	 * Check a guest in: the guarded {@code CONFIRMED → COMPLETED} transition, keyed on the booking
	 * {@code code} and scoped to {@code venueId} and the {@code serviceDate} (today in
	 * {@code Europe/Tirane}, invariant #6), stamping {@code completed_at}. Returns the completed facts
	 * via SQL {@code RETURNING} <strong>iff</strong> a row actually transitioned — the row lock, not
	 * the predicate, makes concurrent scans yield exactly one winner; a 0-row {@code empty} is the
	 * caller's signal to classify against {@link #findCheckInFacts committed state}.
	 */
	Optional<ai.riviera.platform.booking.application.checkin.CompletedCheckIn> completeConfirmed(
			String code, VenueId venueId, LocalDate serviceDate, Instant completedAt);

	/**
	 * Mark every {@code CONFIRMED} booking dated before {@code today} as {@code NO_SHOW}, returning
	 * how many transitioned. The {@code status = 'CONFIRMED'} guard serializes against a concurrent
	 * check-in or cancel, so a lost race and a repeated run are alike 0-row no-ops.
	 */
	int markPastConfirmedAsNoShow(LocalDate today);

	/**
	 * The status + service date behind a code at one venue, for classifying a check-in whose guarded
	 * transition matched 0 rows. Venue-scoped: a foreign venue's code reads as {@code empty},
	 * indistinguishable from an unknown one (non-enumerating; the code never travels further,
	 * invariant #7).
	 */
	Optional<ai.riviera.platform.booking.application.checkin.CheckInFacts> findCheckInFacts(
			String code, VenueId venueId);

	/**
	 * The {@code CONFIRMED}, {@code COMPLETED} and {@code NO_SHOW} bookings for {@code venueId} on
	 * {@code date} as {@code (setId, code, status)} rows ordered by set, for the staff daily view —
	 * a settled arrival stays listed, flagged by its status, so a past day is not empty. Excludes
	 * awaiting-payment and cancelled bookings. The {@code code} is the bearer credential (invariant
	 * #7) — carried to the operator-gated caller, never logged.
	 */
	List<DailyBooking> findConfirmedForVenueOn(VenueId venueId, LocalDate date);

	/**
	 * The {@code CONFIRMED} bookings for {@code venueId} on {@code date} as {@code (id, amountMinor)}
	 * rows — the candidate set for the admin weather refund. Excludes awaiting-payment and
	 * already-cancelled bookings. The caller force-cancels each via the guarded
	 * {@link #cancelConfirmed}, so a concurrent cancel makes the matching row a no-op. Ordered by id for
	 * stable iteration.
	 */
	List<RefundableBooking> findConfirmedForWeatherRefund(VenueId venueId, LocalDate date);

	/**
	 * The ids of bookings still {@code AWAITING_PAYMENT} that can no longer be paid — the
	 * abandoned-payment sweep's candidate set, on three disjoint arms. A closed tab produces no
	 * terminating webhook, so such a booking lingers and keeps its {@code (set, date)} claimed; the
	 * sweep cancels the PaymentIntent and releases the claim. Ordered by id for stable iteration.
	 *
	 * @param createdBefore        an instant booking expires on its creation clock (the TTL)
	 * @param acceptedBefore       an accepted request expires on its accept clock, per
	 *        {@link ai.riviera.platform.booking.application.request.RequestWindows#acceptedBefore}
	 * @param serviceDayOnOrBefore any booking for a service day already underway expires regardless of
	 *        either window (invariant #4) — a payment past that instant would buy a day the guest can
	 *        already consume
	 */
	List<BookingId> findExpirableAwaitingPayment(Instant createdBefore, Instant acceptedBefore,
			LocalDate serviceDayOnOrBefore);

	/**
	 * The ids of {@code PENDING_REQUEST} bookings past their stored deadline — the request-expiry sweep's
	 * candidate set. The sweep then expires each via the guarded {@link #expirePendingRequest} in its own
	 * transaction, for per-row failure isolation like the abandoned-payment sweep.
	 */
	List<BookingId> findOverduePendingRequests(Instant now);

	/**
	 * Expire one overdue pending request: the guarded {@code PENDING_REQUEST → EXPIRED} transition
	 * ({@code … AND request_expires_at <= now}), {@code RETURNING} its {@code (set, date)} iff it
	 * transitioned so the caller releases the soft-hold exactly once (invariant #2). The guard is
	 * disjoint from accept's ({@code <= now} vs {@code > now}) and from decline's (status), so no race
	 * can double-act; a candidate accepted or declined since the read is a clean empty no-op.
	 */
	Optional<ClaimRef> expirePendingRequest(long bookingId, Instant now);

	/**
	 * Withdraw a pending request at the guest's own request: the guarded
	 * {@code PENDING_REQUEST → WITHDRAWN} transition, keyed on the booking {@code code} — the bearer
	 * credential (invariant #7), so knowing it authorizes the act and no venue scope applies.
	 * {@code RETURNING}s the booking id and its {@code (set, date)} iff a row actually transitioned, so
	 * the caller releases the soft-hold exactly once (invariant #2); a lost race against a concurrent
	 * decline, accept or expiry sweep is a 0-row {@code empty} no-op.
	 *
	 * <p>Like {@link #declinePending} and unlike {@link #expirePendingRequest} it is deliberately NOT
	 * deadline-guarded: an overdue-but-unswept request may still be withdrawn.
	 */
	Optional<ai.riviera.platform.booking.application.request.WithdrawnRequest> withdrawPendingRequest(
			String code);
}
