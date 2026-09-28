package ai.riviera.platform.booking.application;

import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.view.StayRecord;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.booking.application.reserve.NewBooking;
import ai.riviera.platform.booking.application.reserve.NewStay;
import ai.riviera.platform.booking.application.refund.RefundableBooking;
import ai.riviera.platform.booking.application.cancel.CancelledBooking;
import ai.riviera.platform.booking.application.reserve.ClaimRef;
import ai.riviera.platform.booking.application.reserve.ConfirmedBooking;
import ai.riviera.platform.booking.application.reserve.ConfirmedStay;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.OptionalLong;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.application.remodel.LiveClaim;
import ai.riviera.platform.booking.application.view.DailyBooking;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * The {@code booking} module's outbound persistence port (driven seam). Keeping the SQL out of the
 * use case lets the branch logic be unit-tested with a fake. Implemented by {@code JdbcBookings}
 * (explicit SQL, invariant #1).
 */
public interface Bookings {

	/**
	 * Insert in {@code AWAITING_PAYMENT} and return the id, or empty on a {@code code} collision
	 * ({@code ON CONFLICT (code) DO NOTHING}, invariant #7): regenerate and retry — the transaction
	 * survives, unlike on a thrown unique violation. Other integrity failures (FK/CHECK) still throw.
	 */
	OptionalLong insertAwaitingPayment(NewBooking booking);

	/**
	 * Insert a new booking in {@code PENDING_REQUEST} with its venue-response deadline. Same
	 * code-collision contract as {@link #insertAwaitingPayment}. No payment exists yet — a
	 * PaymentIntent is created only if the venue accepts.
	 */
	OptionalLong insertPendingRequest(NewBooking booking, Instant requestExpiresAt);

	/**
	 * Insert a stay (the group a stitched itinerary's bookings belong to, design D6) and return its id,
	 * or empty on a {@code code} collision — the same contract as {@link #insertAwaitingPayment}.
	 */
	OptionalLong insertStay(NewStay stay);

	/**
	 * Guarded venue-scoped {@code PENDING_REQUEST → AWAITING_PAYMENT} of a lone request (never a stay's
	 * stretch, #1267, nor in the next three) while {@code request_expires_at > now}, stamping {@code accepted_at}.
	 * The facts iff a row transitioned; on empty the caller classifies via {@link #requestSnapshot}.
	 */
	Optional<ai.riviera.platform.booking.application.request.AcceptedRequest> acceptPendingRequest(
			long bookingId, VenueId venueId, Instant now);

	/** The set and span of a {@code PENDING_REQUEST} at this venue, else empty (a foreign booking reads as absent, #13). */
	Optional<ClaimRef> findPendingRequestSpan(long bookingId, VenueId venueId);

	/**
	 * Guarded {@code PENDING_REQUEST → DECLINED} of every pending request on {@code setId} overlapping
	 * {@code [firstDay, lastDay]}, a stay's with every stretch (#1267), stamping {@code reason}; the rows
	 * that moved (ADR-0025: an accept's rivals, called once the accepted rows left pending).
	 */
	List<ai.riviera.platform.booking.application.request.DeclinedRival> declineRivals(
			SetId setId, LocalDate firstDay, LocalDate lastDay, DeclineReason reason);

	/** A pending stay request's stretches at this venue in day order, else empty (a foreign stay reads as absent, #13). */
	List<ai.riviera.platform.booking.application.request.StayStretchRef> findPendingStayStretches(StayId stayId,
			VenueId venueId);

	/**
	 * {@link #acceptPendingRequest} for every stretch of a stay request in one guarded statement, all
	 * sharing {@code accepted_at}; the facts of the rows that moved (every stretch, or none).
	 */
	List<ai.riviera.platform.booking.application.request.AcceptedRequest> acceptPendingStay(StayId stayId,
			VenueId venueId, Instant now);

	/**
	 * Guarded venue-scoped {@code PENDING_REQUEST → DECLINED} of every stretch of a stay request, stamping
	 * {@code reason}; true iff they moved, so the caller publishes once. Not deadline-guarded.
	 */
	boolean declinePendingStay(StayId stayId, VenueId venueId, DeclineReason reason);

	/** The stay this booking is a stretch of; empty for a lone booking or an unknown id. */
	Optional<StayId> stayOf(long bookingId);

	/** {@link #requestSnapshot} of a stay request: its stretches' statuses and shared deadline, or empty. */
	Optional<ai.riviera.platform.booking.application.request.RequestSnapshot> stayRequestSnapshot(StayId stayId,
			VenueId venueId);

	/**
	 * Compensate a failed payment-request issuance: the guarded {@code AWAITING_PAYMENT →
	 * PENDING_REQUEST} revert (clearing {@code accepted_at}), possible only because no
	 * PaymentIntent exists to race it. True iff a row reverted.
	 */
	boolean revertAcceptToPending(long bookingId);

	/**
	 * Guarded venue-scoped {@code PENDING_REQUEST → DECLINED} stamping {@code reason}; the {@link ClaimRef}
	 * iff it transitioned, so the caller publishes exactly once (nothing to release: ADR-0025). Not
	 * deadline-guarded: an expired-but-unswept request may still be declined.
	 */
	Optional<ClaimRef> declinePending(long bookingId, VenueId venueId, DeclineReason reason);

	/**
	 * Status + deadline of a booking at this venue, or empty when unknown <em>or another venue's</em>
	 * — lets accept/decline classify a missed transition without disclosing foreign bookings (#13).
	 */
	Optional<ai.riviera.platform.booking.application.request.RequestSnapshot> requestSnapshot(
			long bookingId, VenueId venueId);

	/**
	 * The venue's {@code PENDING_REQUEST} bookings ordered by response deadline, most urgent first
	 * — the operator queue. Carries no booking code (invariant #7).
	 */
	List<ai.riviera.platform.booking.application.request.PendingRequestRow> findPendingRequestsForVenue(
			VenueId venueId);

	/**
	 * Load a booking by its {@code code} (the bearer credential, invariant #7) for the view and
	 * cancel use cases, or {@code empty} if no booking has that code. Read-only — carries the full
	 * row the caller needs without exposing the aggregate.
	 */
	Optional<BookingRecord> findByCode(String code);

	/** The stay whose code this is, with its stretches in day order; empty for a booking's code or an unknown one. */
	Optional<StayRecord> findStayByCode(String code);

	/** The stay's stretches in day order, row-locked for the transaction so the caller's guarded transitions cannot lose a race. */
	List<BookingRecord> lockStretches(StayId stayId);

	/**
	 * The bookings linked to a customer account, newest first, a stitched stay as one record
	 * ({@link StayRecord#asBooking}); never a guest booking (NULL {@code account_id}). Pass the session
	 * principal's id, never a request param (BOLA, invariant #13).
	 */
	List<BookingRecord> findByAccountId(CustomerAccountId accountId);

	/**
	 * Strict {@code AWAITING_PAYMENT → CONFIRMED} (anything else throws) for the synchronous stub
	 * path, returning the {@code BookingConfirmed} facts via {@code RETURNING}. The stay's {@code
	 * booking_day} rows come from trigger {@code booking_day_on_confirm}, never a statement here.
	 */
	ConfirmedBooking confirm(long bookingId, Instant confirmedAt);

	/**
	 * Webhook confirm (invariant #8), <strong>idempotent</strong>: {@code AWAITING_PAYMENT →
	 * CONFIRMED}; a 0-row update (already transitioned, re-delivery) is {@code empty}, never an
	 * error. Present means it transitioned: publish exactly one {@code BookingConfirmed}.
	 */
	Optional<ConfirmedBooking> confirmFromPayment(long bookingId, Instant confirmedAt);

	/**
	 * Row-locks the stay, then answers it iff every stretch is confirmed. Call after a stretch's confirm:
	 * the lock serializes concurrent stretch confirms, so exactly one of them sees the stay complete.
	 */
	Optional<ConfirmedStay> lockConfirmedStay(StayId stayId);

	/**
	 * Webhook {@code AWAITING_PAYMENT → CANCELLED}, returning the {@link ClaimRef} iff it
	 * transitioned so the caller releases every day's claim exactly once (invariant #2); empty
	 * otherwise, and nothing is released.
	 */
	Optional<ClaimRef> cancelAwaitingPayment(long bookingId);

	/**
	 * Guest-path {@code CONFIRMED → CANCELLED}, stamping the server-computed refund and policy reason
	 * (#10), returning the refund + {@code BookingCancelled} facts via {@code RETURNING}. Guarded on
	 * {@code CONFIRMED}: a double-cancel is an {@code empty} no-op; a swept no-show is out of reach.
	 */
	Optional<CancelledBooking> cancelConfirmed(long bookingId, java.time.Instant cancelledAt,
			long refundMinor, ai.riviera.platform.booking.vocabulary.RefundReason reason);

	/**
	 * Guarded re-seat of a live booking from {@code from} to {@code to} (same venue); code, price and
	 * status survive (invariant #7). False when not live or not on {@code from} — the caller
	 * then rolls back, since a move classified under lock cannot legitimately vanish.
	 */
	boolean moveToSet(long bookingId, SetId from, SetId to, Instant movedAt);

	/**
	 * Admin weather refund: like {@link #cancelConfirmed} but also admitting {@code NO_SHOW} (the
	 * storm's already-swept stay-homes), stamping {@code WEATHER}; separate so a no-show is never
	 * guest-cancellable. A re-run or concurrent cancel is an {@code empty} no-op: one refund each.
	 */
	Optional<CancelledBooking> cancelForWeather(long bookingId, java.time.Instant cancelledAt,
			long refundMinor);

	/**
	 * Venue-scoped stamp of {@code attended_at} on the {@code CONFIRMED} booking's {@code serviceDate}
	 * (today in {@code Europe/Tirane}, #6), resolving {@code COMPLETED} when no later day remains.
	 * Present iff a day moved (row lock: one winner); else classify via {@link #findCheckInFacts}.
	 */
	Optional<ai.riviera.platform.booking.application.checkin.CompletedCheckIn> completeConfirmed(
			String code, VenueId venueId, LocalDate serviceDate, Instant completedAt);

	/**
	 * No-show sweep step 1: mark missed every unresolved pre-{@code today} day of up to {@code
	 * batchSize} {@code CONFIRMED} bookings, returning days moved; races and re-runs are 0-row no-ops.
	 * Batched to fit the bounded client's timeout; fewer than {@code batchSize} rows means drained.
	 */
	int markPastServiceDaysMissed(LocalDate today, int batchSize);

	/**
	 * No-show sweep step 2: resolve up to {@code batchSize} {@code CONFIRMED} bookings whose last day
	 * is before {@code today} ({@code COMPLETED} if any day attended, else {@code NO_SHOW}), returning
	 * bookings resolved. Guarded, batched and drained as {@link #markPastServiceDaysMissed}.
	 */
	int markPastConfirmedAsNoShow(LocalDate today, int batchSize);

	/**
	 * Status, first service day and whether {@code today} is attended behind a code, to classify a
	 * 0-row check-in. Venue-scoped: a foreign code reads {@code empty} like an unknown one (#7).
	 */
	Optional<ai.riviera.platform.booking.application.checkin.CheckInFacts> findCheckInFacts(
			String code, VenueId venueId, LocalDate today);

	/**
	 * The move-reminder sweep's candidates: {@code CONFIRMED} stretches arriving on {@code moveDay} whose
	 * stay holds a live ({@code CONFIRMED}/{@code COMPLETED}) stretch on another set ending the day before,
	 * not yet stamped; each is then stamped via {@link #stampMoveReminder} in its own transaction.
	 */
	List<BookingId> findStayMovesDue(LocalDate moveDay);

	/**
	 * Guarded stamp of {@code move_reminder_at} on a still-{@code CONFIRMED}, unstamped stretch, returning
	 * the move iff this statement stamped it — the caller publishes exactly once (ADR-0018).
	 */
	Optional<ai.riviera.platform.booking.application.checkin.DueMove> stampMoveReminder(long bookingId,
			Instant at);

	/**
	 * The venue's {@code CONFIRMED}/{@code COMPLETED}/{@code NO_SHOW} bookings on {@code date},
	 * ordered by set, for the staff daily view. The {@code code} is a bearer credential — for the
	 * operator-gated caller only, never logged (invariant #7).
	 */
	List<DailyBooking> findSettledForVenueOn(VenueId venueId, LocalDate date);

	/**
	 * The venue's {@code CONFIRMED}/{@code NO_SHOW} bookings covering {@code date}, by id — the
	 * weather refund's candidates, matching {@link #cancelForWeather}'s statuses. The caller cancels
	 * one-day bookings and only names a multi-day stay.
	 */
	List<RefundableBooking> findRefundableForWeather(VenueId venueId, LocalDate date);

	/**
	 * Ids of unpayable {@code AWAITING_PAYMENT} bookings (a closed tab sends no webhook), by id: instant
	 * ones created before {@code createdBefore}, accepted requests accepted before {@code
	 * acceptedBefore}, and any whose service day ended by {@code serviceDayEndedOnOrBefore} (#4).
	 */
	List<BookingId> findExpirableAwaitingPayment(Instant createdBefore, Instant acceptedBefore,
			LocalDate serviceDayEndedOnOrBefore);

	/**
	 * Ids of {@code PENDING_REQUEST} bookings past their stored deadline — the request-expiry sweep's
	 * candidates, each then expired via {@link #expirePendingRequest} in its own transaction.
	 */
	List<BookingId> findOverduePendingRequests(Instant now);

	/**
	 * Guarded {@code PENDING_REQUEST → EXPIRED} ({@code request_expires_at <= now}) of a lone request, returning
	 * the span iff it transitioned so the caller publishes once (nothing to release: ADR-0025). Disjoint
	 * from accept's ({@code > now}) and decline's guards, so a raced candidate is a clean empty no-op.
	 */
	Optional<ClaimRef> expirePendingRequest(long bookingId, Instant now);

	/**
	 * {@link #expirePendingRequest} for the stay request {@code bookingId} is a stretch of, whole (#1267):
	 * the stay iff its stretches moved; empty for a lone request, or one another leg already ended.
	 */
	Optional<StayId> expirePendingStayOf(long bookingId, Instant now);

	/**
	 * {@link #withdrawPendingRequest} of a stay request by the stay's own code, every stretch or none
	 * (#1267); the stay iff they moved. A stretch's row code is never honoured (invariant #7).
	 */
	Optional<StayId> withdrawPendingStay(String code);

	/**
	 * Guest withdrawal of a lone request: guarded {@code PENDING_REQUEST → WITHDRAWN} keyed on the bearer {@code code}
	 * (#7, no venue scope), returning id + span iff it transitioned (nothing to release: ADR-0025).
	 * Not deadline-guarded; a lost race is an {@code empty} no-op.
	 */
	Optional<ai.riviera.platform.booking.application.request.WithdrawnRequest> withdrawPendingRequest(
			String code);

	/**
	 * Every booking a guest may still turn up on (the {@code BookingStatus#canStillBeHonoured}
	 * statuses) holding any of the given sets, on any date — the remodel preview's claims. Ordered
	 * by service date then id. An empty input answers empty without a round-trip.
	 */
	List<LiveClaim> findLiveOnSets(Collection<SetId> setIds);
}
