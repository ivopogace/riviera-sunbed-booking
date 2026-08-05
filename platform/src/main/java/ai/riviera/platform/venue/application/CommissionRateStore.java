package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Outbound (driven) port: commission-rate storage (A7, epic #348) — the venue's <strong>live</strong>
 * rate and its <strong>effective-dated schedule</strong>, plus the platform-wide read the admin list
 * needs. Internal to the module, implemented by the module's own {@code adapter.out} JDBC adapter, so
 * it is not published in {@code api/} (invariant #11).
 *
 * <p><strong>Why not three more methods on {@link Venues}.</strong> {@code Venues} is already the
 * broad venue write store, and the rate is a different conversation with a different actor: the
 * platform admin setting a commercial term, not an owner editing their venue. Keeping it apart is the
 * same least-privilege split the published {@code venue::api} surface made by consumer role (#94) —
 * and it means a caller that only administers rates cannot reach the beach-map writes.
 *
 * <p><strong>Two writes, one value, different date ranges.</strong> {@link #updateLiveRate} sets the
 * rate every <em>decision</em> from now on uses (an accrual, a refund computation);
 * {@link #schedule} records which <em>service dates</em> that rate governs for reporting. A rate
 * change performs both, with the same bps, in one transaction: they differ in the dates they answer
 * for, never in value. Nothing here rewrites a past schedule row or a ledger entry — the schedule is
 * forward-only, so history is never repriced (invariant #9).
 */
public interface CommissionRateStore {

	/**
	 * Record that {@code commissionBps} applies to the venue's bookings served on or after
	 * {@code effectiveFrom} — a civil date in {@code Europe/Tirane} (invariant #6). Idempotent per
	 * {@code (venue, effectiveFrom)}: a second write for the same date overwrites the rate rather than
	 * erroring or duplicating, so two admins acting on the same day collapse onto one row carrying the
	 * last value.
	 *
	 * <p>Called only with a date the service computed, never one a request supplied.
	 */
	void schedule(VenueId venueId, LocalDate effectiveFrom, int commissionBps);

	/**
	 * Overwrite the venue's live commission rate — the column {@code VenueRates#commissionBps} reads
	 * at decision time. Returns the number of rows changed: {@code 0} means no venue has this id, so
	 * the caller reports not-found and schedules nothing.
	 *
	 * <p>Deliberately unconditional otherwise: unlike the venue profile write there is no
	 * optimistic-concurrency token, because a rate is a single scalar an admin sets outright rather
	 * than a loaded form that could be stale. Two admins racing therefore resolve last-writer-wins,
	 * which is the honest outcome for "the commission is now X".
	 */
	int updateLiveRate(VenueId venueId, int commissionBps);

	/**
	 * Every venue with its live commission rate and payout currency, <strong>ordered by name then
	 * id</strong> — the platform-admin read model. Deliberately platform-wide: no ownership filter and
	 * no id set, which is why only an ADMIN-gated caller may reach it (invariant #13's
	 * {@code /api/admin/**} exemption). Contrast {@code Venues#findSummaries}, whose ids the caller has
	 * already reduced to what one operator owns.
	 */
	List<VenueCommissionView> findAll();
}
