package ai.riviera.platform.customer.application;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Period;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.customer.spi.GuestBookingHistory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit spec for the retention-sweep decision logic (Slice 2 of #101), against hand fakes of the
 * {@link AccountErasureStore} and {@link GuestBookingHistory} ports and a fixed {@link Clock} (no Spring,
 * no DB) — the {@code AccountErasureServiceTest} pattern.
 *
 * <p>The fixed instant is deliberately <strong>22:30 UTC</strong>, which is already the <em>next</em> day in
 * {@code Europe/Tirane} (UTC+2 in July). A sweep that reasoned in UTC — or in the JVM default zone — would
 * compute a cutoff one day earlier and fail {@code derivesCutoffFromConfiguredWindowInTiraneZone}, so the
 * zone rule of invariant #6 is genuinely pinned rather than incidentally satisfied.
 *
 * <p>The real candidate/scrub SQL, the live-account gate, and the survival of the retained
 * booking/payment/payout rows are proven separately by {@code GuestContactRetentionIT}.
 */
class ExpireGuestContactsServiceTest {

	/** 22:30 UTC on the 25th = 00:30 on the 26th in Europe/Tirane — the zone must decide the date. */
	private static final Clock FIXED = Clock.fixed(Instant.parse("2026-07-25T22:30:00Z"), ZoneOffset.UTC);

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	/** Today in Europe/Tirane at {@link #FIXED}, minus the two-year window below. */
	private static final LocalDate EXPECTED_CUTOFF = LocalDate.of(2024, 7, 26);

	private final FakeRetentionStore store = new FakeRetentionStore();
	private final FakeGuestBookingHistory history = new FakeGuestBookingHistory();
	private final ExpireGuestContactsService service = service(500);

	private ExpireGuestContactsService service(int batchSize) {
		return new ExpireGuestContactsService(store, history, new RetentionWindow(Period.ofYears(2), batchSize),
				FIXED);
	}

	@Test
	void scrubsGuestWhoseRetentionBasisExpired() {
		CustomerId stale = store.liveGuest();
		history.lastBooking(stale, LocalDate.of(2021, 8, 1));

		assertThat(service.sweep()).isEqualTo(1);
		assertThat(store.erased(stale)).isTrue();
	}

	@Test
	void retainsGuestWithBookingOnTheCutoffDate() {
		CustomerId onBoundary = store.liveGuest();
		history.lastBooking(onBoundary, EXPECTED_CUTOFF); // exactly today − 2 years: inclusive-retain

		assertThat(service.sweep()).isZero();
		assertThat(store.erased(onBoundary)).isFalse();
	}

	@Test
	void scrubsGuestWithNoBookingsAtAll() {
		CustomerId neverBooked = store.liveGuest(); // no retention basis to protect it

		assertThat(service.sweep()).isEqualTo(1);
		assertThat(store.erased(neverBooked)).isTrue();
	}

	@Test
	void sweepIsIdempotent() {
		CustomerId stale = store.liveGuest();
		history.lastBooking(stale, LocalDate.of(2019, 5, 4));
		assertThat(service.sweep()).isEqualTo(1);

		assertThat(service.sweep())
				.as("an already-tombstoned row is not a candidate, so a second sweep scrubs nothing")
				.isZero();
		assertThat(store.eraseAttempts(stale)).isEqualTo(1);
	}

	@Test
	void scrubsAtMostOneBatchPerRun() {
		store.liveGuest();
		store.liveGuest();
		store.liveGuest();

		assertThat(service(2).sweep()).isEqualTo(2);
		assertThat(store.liveCount()).as("the remainder waits for the next run").isEqualTo(1);
	}

	@Test
	void derivesCutoffFromConfiguredWindowInTiraneZone() {
		store.liveGuest();

		service.sweep();

		assertThat(history.lastCutoff()).isEqualTo(EXPECTED_CUTOFF);
		assertThat(store.lastOlderThan())
				.as("the row-age gate uses the same cutoff, as a Tirane start-of-day instant")
				.isEqualTo(EXPECTED_CUTOFF.atStartOfDay(TIRANE).toInstant());
	}

	@Test
	void sweepWithNoCandidatesNeverProbesBookingHistory() {
		assertThat(service.sweep()).isZero();
		assertThat(history.probed()).isFalse();
	}

	/**
	 * In-memory store mirroring the adapter's two retention methods: candidates are the live (non-tombstoned)
	 * guests, capped by the batch limit and returned in insertion order (the SQL's {@code ORDER BY c.id});
	 * {@code eraseGuestById} tombstones a live row and is a no-op on an already-tombstoned one (mirrors the
	 * {@code erased_at IS NULL} guard). The row-age and live-account gates are SQL-level and belong to the IT;
	 * the fake only records the instant it was asked for.
	 */
	private static final class FakeRetentionStore implements AccountErasureStore {
		private final List<CustomerId> guests = new ArrayList<>();
		private final Map<CustomerId, Boolean> erased = new HashMap<>();
		private final Map<CustomerId, Integer> eraseAttempts = new HashMap<>();
		private Instant lastOlderThan;
		private long nextId = 1;

		CustomerId liveGuest() {
			CustomerId id = new CustomerId(nextId++);
			guests.add(id);
			erased.put(id, false);
			return id;
		}

		boolean erased(CustomerId id) {
			return Boolean.TRUE.equals(erased.get(id));
		}

		int eraseAttempts(CustomerId id) {
			return eraseAttempts.getOrDefault(id, 0);
		}

		long liveCount() {
			return guests.stream().filter(id -> !erased(id)).count();
		}

		Instant lastOlderThan() {
			return lastOlderThan;
		}

		@Override
		public List<CustomerId> expiredGuestCandidates(Instant olderThan, int limit) {
			lastOlderThan = olderThan;
			return guests.stream().filter(id -> !erased(id)).limit(limit).toList();
		}

		@Override
		public boolean eraseGuestById(CustomerId guestId) {
			eraseAttempts.merge(guestId, 1, Integer::sum);
			if (!erased.containsKey(guestId) || erased(guestId)) {
				return false;
			}
			erased.put(guestId, true);
			return true;
		}

		@Override
		public Optional<String> emailOfAccount(CustomerAccountId accountId) {
			throw new UnsupportedOperationException("not exercised by the retention spec");
		}

		@Override
		public boolean eraseAccountById(CustomerAccountId accountId) {
			throw new UnsupportedOperationException("not exercised by the retention spec");
		}

		@Override
		public boolean eraseAccountByEmail(String normalizedEmail) {
			throw new UnsupportedOperationException("not exercised by the retention spec");
		}

		@Override
		public int eraseGuestByEmail(String normalizedEmail) {
			throw new UnsupportedOperationException("not exercised by the retention spec");
		}
	}

	/** In-memory booking history: a guest is in basis iff its recorded booking date is on or after the cutoff. */
	private static final class FakeGuestBookingHistory implements GuestBookingHistory {
		private final Map<CustomerId, LocalDate> lastBooking = new HashMap<>();
		private LocalDate lastCutoff;
		private boolean probed;

		void lastBooking(CustomerId guest, LocalDate date) {
			lastBooking.put(guest, date);
		}

		LocalDate lastCutoff() {
			return lastCutoff;
		}

		boolean probed() {
			return probed;
		}

		@Override
		public Set<CustomerId> withBookingOnOrAfter(Collection<CustomerId> guests, LocalDate cutoff) {
			probed = true;
			lastCutoff = cutoff;
			Set<CustomerId> inBasis = new HashSet<>();
			for (CustomerId guest : guests) {
				LocalDate booking = lastBooking.get(guest);
				if (booking != null && !booking.isBefore(cutoff)) {
					inBasis.add(guest);
				}
			}
			return inBasis;
		}
	}
}
