package ai.riviera.platform.venue.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The platform-admin commission-rate write (A7, epic #348). Two properties carry the slice and both
 * are pinned here at the application boundary, with a fake store at the only seam:
 *
 * <ol>
 * <li><strong>The write does two things with one value.</strong> It sets the <em>live</em> rate — what
 * the next accrual reads at decision time — and schedules that same rate from <em>today</em> for
 * the per-service-date reporting read. Same bps, different jobs. A write that did only the
 * first would leave the takings strip reporting a rate no new accrual applies; only the second
 * would leave accruals on the old rate forever.</li>
 * <li><strong>"Today" is a civil date in {@code Europe/Tirane}</strong> (invariant #6), computed
 * from the injected UTC clock — never {@code LocalDate.now()}. The boundary case is the point: late
 * UTC evening is already the next day in Tirane, so the effective date must be one calendar day on
 * from the UTC date, not the same.</li>
 * </ol>
 *
 * <p>Effective-from is <strong>today rather than tomorrow</strong> because same-day sales stay open
 * until the venue's sales close (invariant #4): a booking confirmed after the change accrues at the
 * new live rate, so today's reporting must answer that same rate or the strip and the ledger would
 * disagree for the rest of the day. Nothing about the effective date comes from the request — the
 * schedule is forward-only, so no call can reprice a day already sold (invariant #9).
 */
class VenueCommissionServiceTest {

	private static final VenueId VENUE = new VenueId(3);
	private static final VenueId UNKNOWN = new VenueId(404);

	/** Midday UTC on 2026-08-05, which is the same civil day in Tirane (UTC+2 in August). */
	private static final Clock MIDDAY = Clock.fixed(Instant.parse("2026-08-05T12:00:00Z"), ZoneOffset.UTC);
	/** 22:30 UTC on 2026-08-05 — already 2026-08-06 in Tirane, so "today" is the 6th. */
	private static final Clock LATE_UTC_EVENING =
			Clock.fixed(Instant.parse("2026-08-05T22:30:00Z"), ZoneOffset.UTC);

	@Test
	void writeUpdatesTheLiveRateAndSchedulesItFromToday() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		Optional<VenueCommissionView> updated =
				service.setCommission(VENUE, new CommissionRateCommand(2000));

		assertTrue(updated.isPresent());
		assertEquals(2000, updated.get().commissionBps());
		assertEquals(2000, store.liveRates.get(VENUE.value()),
				"the live rate is what the next accrual reads at decision time");
		assertEquals(List.of(new Scheduled(VENUE.value(), LocalDate.of(2026, 8, 5), 2000)),
				store.scheduled,
				"the same rate is scheduled from today, so its reporting matches the live rate "
						+ "while the pinned floor keeps every past service date on its own");
	}

	@Test
	void todayIsReckonedInTiraneNotUtc() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, LATE_UTC_EVENING);

		service.setCommission(VENUE, new CommissionRateCommand(2000));

		assertEquals(LocalDate.of(2026, 8, 6), store.scheduled.getFirst().effectiveFrom(),
				"22:30 UTC is still the 5th in UTC but already the 6th in Tirane (invariant #6)");
	}

	/**
	 * The ordering IS the invariant: pin after the update and the floor would hold the NEW rate, so
	 * every past service date would silently reprice — the defect this slice fixes (invariant #9).
	 */
	@Test
	void thePreviousRateIsPinnedBeforeTheLiveColumnMoves() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		service.setCommission(VENUE, new CommissionRateCommand(2000));

		assertEquals(1500, store.pinnedFloors.get(VENUE.value()),
				"the floor must capture the rate being superseded, not the one replacing it");
	}

	@Test
	void aSecondChangeLeavesTheFirstPinnedFloorAlone() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		service.setCommission(VENUE, new CommissionRateCommand(2000));
		service.setCommission(VENUE, new CommissionRateCommand(2500));

		assertEquals(1500, store.pinnedFloors.get(VENUE.value()),
				"the floor holds the oldest rate known, so a later change must not overwrite it");
	}

	@Test
	void anUnknownVenueSchedulesNothing() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		Optional<VenueCommissionView> updated =
				service.setCommission(UNKNOWN, new CommissionRateCommand(2000));

		assertTrue(updated.isEmpty(), "no such venue — the caller answers 404");
		assertTrue(store.scheduled.isEmpty(),
				"a schedule row for a venue that does not exist would outlive the failed write");
		assertTrue(store.pinnedFloors.isEmpty(), "and neither would a pinned floor");
	}

	/**
	 * Idempotent-looking writes still record the schedule row: the store collapses same-day writes on
	 * {@code (venue, effective_from)}, so re-asserting the current rate must not be special-cased here.
	 */
	@Test
	void aRateWriteAtTheSameValueIsStillScheduled() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		service.setCommission(VENUE, new CommissionRateCommand(1500));

		assertEquals(1, store.scheduled.size());
		assertEquals(1500, store.scheduled.getFirst().commissionBps());
	}

	@Test
	void zeroAndFullCommissionAreBothAcceptedRates() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		assertEquals(0, service.setCommission(VENUE, new CommissionRateCommand(0))
				.orElseThrow().commissionBps());
		assertEquals(10_000, service.setCommission(VENUE, new CommissionRateCommand(10_000))
				.orElseThrow().commissionBps());
	}

	@Test
	void theListIsTheStoresOrderedAnswer() {
		FakeCommissionRateStore store = storeWith(VENUE, 1500);
		store.listed = List.of(new VenueCommissionView(2, "Aurora", "Dhermi", 1000, "EUR"),
				new VenueCommissionView(3, "Sunset", "Ksamil", 1500, "EUR"));
		VenueCommissionService service = new VenueCommissionService(store, MIDDAY);

		assertEquals(store.listed, service.venueCommissions(),
				"ordering is the store's ORDER BY, not re-derived here");
	}

	private static FakeCommissionRateStore storeWith(VenueId venue, int commissionBps) {
		FakeCommissionRateStore store = new FakeCommissionRateStore();
		store.liveRates.put(venue.value(), commissionBps);
		return store;
	}

	/** One recorded {@code schedule} call, so a test can assert the date as well as the rate. */
	private record Scheduled(long venueId, LocalDate effectiveFrom, int commissionBps) {
	}

	/**
	 * In-memory {@link CommissionRateStore}: only a seeded venue can have its live rate updated, and
	 * {@code pinnedFloors} records what {@code ensureFloorRate} saw in the live column when it ran —
	 * which is how a test can tell the pin happened <em>before</em> the update rather than after.
	 */
	private static final class FakeCommissionRateStore implements CommissionRateStore {
		final Map<Long, Integer> liveRates = new HashMap<>();
		final Map<Long, Integer> pinnedFloors = new HashMap<>();
		final List<Scheduled> scheduled = new ArrayList<>();
		List<VenueCommissionView> listed = List.of();

		@Override
		public void ensureFloorRate(VenueId venueId) {
			Integer live = liveRates.get(venueId.value());
			if (live != null) {
				pinnedFloors.putIfAbsent(venueId.value(), live); // DO NOTHING on conflict
			}
		}

		@Override
		public void schedule(VenueId venueId, LocalDate effectiveFrom, int commissionBps) {
			scheduled.add(new Scheduled(venueId.value(), effectiveFrom, commissionBps));
		}

		@Override
		public Optional<VenueCommissionView> updateLiveRate(VenueId venueId, int commissionBps) {
			if (!liveRates.containsKey(venueId.value())) {
				return Optional.empty();
			}
			liveRates.put(venueId.value(), commissionBps);
			return Optional.of(new VenueCommissionView(venueId.value(), "Sunset", "Ksamil",
					commissionBps, "EUR"));
		}

		@Override
		public List<VenueCommissionView> findAll() {
			return listed;
		}
	}
}
