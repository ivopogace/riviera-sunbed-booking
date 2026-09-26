package ai.riviera.platform.venue.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import ai.riviera.platform.venue.vocabulary.VenueId;

/**
 * Outbound port: the venue's live commission rate, its effective-dated schedule and the platform-wide
 * admin read; kept apart from {@link Venues} so a rate-only caller cannot reach the layout writes.
 * A rate change is three writes, in order: {@link #ensureFloorRate} pins the superseded rate for past
 * dates, {@link #updateLiveRate} sets the rate decisions use, {@link #schedule} records the service dates
 * it governs. Forward-only: no past schedule row or ledger entry is rewritten, so history never reprices (#9).
 */
public interface CommissionRateStore {

	/**
	 * Pin the current rate at the schedule's epoch floor unless a floor row exists; call first in a rate
	 * change, while the live column still holds the superseded rate. Pinned here, not at venue creation, so
	 * raw-SQL inserts need not cooperate; a no-op for an unknown venue (no orphan row).
	 */
	void ensureFloorRate(VenueId venueId);

	/**
	 * Record that {@code commissionBps} governs bookings served from {@code effectiveFrom} (Europe/Tirane,
	 * invariant #6); idempotent per {@code (venue, effectiveFrom)}, last write wins. Only with a
	 * service-computed date, never a request's, and only after {@link #ensureFloorRate}.
	 */
	void schedule(VenueId venueId, LocalDate effectiveFrom, int commissionBps);

	/**
	 * Overwrite the live rate {@code VenueRates#commissionBps} reads and return the venue as it now stands
	 * (one {@code UPDATE … RETURNING}), or empty for an unknown venue — then schedule nothing. No concurrency
	 * token: racing admins resolve last-writer-wins.
	 */
	Optional<VenueCommissionView> updateLiveRate(VenueId venueId, int commissionBps);

	/**
	 * Every venue with its live rate and payout currency, ordered by name then id. Platform-wide with no
	 * ownership filter, so only an ADMIN-gated caller may reach it (invariant #13's {@code /api/admin/**} exemption).
	 */
	List<VenueCommissionView> findAll();
}
