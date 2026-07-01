package ai.riviera.platform.availability.api;

import java.time.LocalDate;

import ai.riviera.platform.venue.vocabulary.SetId;

import ai.riviera.platform.availability.vocabulary.ClaimOutcome;

/**
 * The {@code availability} module's published command port (invariant #11) — the single
 * write seam onto the {@code (set, date)} source of truth. A deep module: this one method
 * hides the pool check (invariant #3), the atomic claim against
 * {@code UNIQUE(set_id, booking_date)}, and the concurrency guarantee (invariant #2) behind
 * a two-argument call returning a {@link ClaimOutcome}.
 *
 * <p>This is a synchronous command, not a domain event, because the caller (the
 * {@code booking} module, U3) needs the result transactionally to decide whether to proceed
 * or reject — the design's claim sequence models it as a direct call. The module is the
 * <strong>only</strong> writer of the availability table; all channels (online booking,
 * later staff tap-to-mark) go through it.
 */
public interface AvailabilityClaim {

	/**
	 * Atomically claim {@code (setId, bookingDate)} for an online booking. At most one caller
	 * can win a given {@code (set, date)} (invariant #2); only {@code ONLINE}-pool sets are
	 * claimable (invariant #3). Never throws on a lost race or a non-claimable set — the
	 * reason is returned as a {@link ClaimOutcome}.
	 *
	 * @param setId       the set to claim
	 * @param bookingDate the calendar day (a {@code LocalDate} in {@code Europe/Tirane})
	 * @return why the claim succeeded or failed
	 */
	ClaimOutcome claim(SetId setId, LocalDate bookingDate);

	/**
	 * Release a previously online-claimed {@code (setId, bookingDate)} — frees the
	 * {@code BOOKED_ONLINE} row so the set is re-claimable (invariant #2). Used when a Stripe
	 * payment is <strong>canceled</strong> before confirmation (U4): the booking never completed,
	 * so the held set must not stay blocked. A no-op if no {@code BOOKED_ONLINE} row exists for
	 * that {@code (set, date)} — only an online claim is released, never a staff-marked row.
	 *
	 * @param setId       the set to free
	 * @param bookingDate the calendar day (a {@code LocalDate} in {@code Europe/Tirane})
	 */
	void release(SetId setId, LocalDate bookingDate);
}
