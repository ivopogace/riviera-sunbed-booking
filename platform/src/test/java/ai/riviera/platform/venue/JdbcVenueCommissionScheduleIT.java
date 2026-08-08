package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.util.OptionalInt;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.VenueRates;
import ai.riviera.platform.venue.application.CommissionRateStore;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The per-service-date rate read against real Postgres — {@code VenueRates
 * #commissionBpsOn} over the {@code venue_commission_rate} schedule (V39), and the write sequence that
 * makes it total.
 *
 * <p>The property under test is the one the slice exists for: <strong>a rate change must not move any
 * past service date's rate.</strong> That holds because the change pins the rate it supersedes at an
 * epoch floor before overwriting the live column — so the ordering
 * ({@link CommissionRateStore#ensureFloorRate} then {@link CommissionRateStore#updateLiveRate}) is not
 * an implementation detail but the invariant itself, and inverting it is what the first test would
 * catch.
 *
 * <p><strong>Venues here are inserted with raw SQL on purpose.</strong> Coverage must not depend on a
 * venue having been created through {@code Venues#insertVenue}: the rest of the suite inserts venues
 * directly, and a future import or manual fix would too. An earlier design seeded the schedule at
 * creation instead, and CI caught it — that is the regression this insert style guards.
 *
 * <p>Runs only when Docker is available (Testcontainers Postgres).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcVenueCommissionScheduleIT {

	private static final LocalDate LONG_PAST = LocalDate.of(2026, 7, 1);
	private static final LocalDate DAY_BEFORE = LocalDate.of(2026, 8, 5);
	private static final LocalDate EFFECTIVE_FROM = LocalDate.of(2026, 8, 6);

	@Autowired
	VenueRates rates;
	@Autowired
	CommissionRateStore commissionRates;
	@Autowired
	JdbcClient jdbc;

	@Test
	void aRateChangeLeavesEveryPastServiceDateAtTheRateItWasSoldAt() {
		VenueId venue = venueAt(1500);

		changeRate(venue, 2000, EFFECTIVE_FROM);

		assertThat(rates.commissionBpsOn(venue, LONG_PAST)).hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, DAY_BEFORE)).hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM)).hasValue(2000);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM.plusYears(1))).hasValue(2000);
	}

	@Test
	void aVenueThatNeverChangedRateNeedsNoScheduleAtAll() {
		VenueId venue = venueAt(1500);

		assertThat(scheduleRowCount(venue))
				.as("an empty schedule IS the answer 'this rate has never changed'")
				.isZero();
		assertThat(rates.commissionBpsOn(venue, LONG_PAST)).hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM.plusYears(1))).hasValue(1500);
	}

	@Test
	void aSecondChangeDoesNotDisturbTheFloorTheFirstOnePinned() {
		VenueId venue = venueAt(1500);
		changeRate(venue, 2000, EFFECTIVE_FROM);

		changeRate(venue, 2500, EFFECTIVE_FROM.plusDays(15));

		assertThat(rates.commissionBpsOn(venue, LONG_PAST))
				.as("the floor holds the oldest rate known, so DO NOTHING not DO UPDATE")
				.hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM)).hasValue(2000);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM.plusDays(14))).hasValue(2000);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM.plusDays(15))).hasValue(2500);
	}

	@Test
	void twoChangesOnTheSameEffectiveDateCollapseToTheLast() {
		VenueId venue = venueAt(1500);

		changeRate(venue, 2000, EFFECTIVE_FROM);
		changeRate(venue, 1800, EFFECTIVE_FROM);

		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM)).hasValue(1800);
		assertThat(rates.commissionBpsOn(venue, LONG_PAST)).hasValue(1500);
	}

	@Test
	void theLiveRateReadAnswersTheNewRateImmediately() {
		VenueId venue = venueAt(1500);

		changeRate(venue, 2000, EFFECTIVE_FROM);

		assertThat(rates.commissionBps(venue))
				.as("the accrual path reads the live column, which moves at once — a booking confirmed "
						+ "now is served on or after the effective date, where the dated read agrees")
				.hasValue(2000);
	}

	@Test
	void anUnknownVenueHasNoRateAndCollectsNoScheduleRow() {
		VenueId missing = new VenueId(-1);

		commissionRates.ensureFloorRate(missing);

		assertThat(rates.commissionBpsOn(missing, LONG_PAST)).isEqualTo(OptionalInt.empty());
		assertThat(scheduleRowCount(missing)).isZero();
	}

	/** The write sequence {@code VenueCommissionService} performs, exercised at the store. */
	private void changeRate(VenueId venue, int commissionBps, LocalDate effectiveFrom) {
		commissionRates.ensureFloorRate(venue);
		commissionRates.updateLiveRate(venue, commissionBps);
		commissionRates.schedule(venue, effectiveFrom, commissionBps);
	}

	/** Raw SQL on purpose — see the class Javadoc. */
	private VenueId venueAt(int commissionBps) {
		return new VenueId(jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency)
				VALUES ('A7 rate venue', 'Test beach', 'Test region', 'INSTANT', :bps, 'EUR')
				RETURNING id
				""")
				.param("bps", commissionBps)
				.query(Long.class)
				.single());
	}

	private int scheduleRowCount(VenueId venue) {
		return jdbc.sql("SELECT COUNT(*) FROM venue_commission_rate WHERE venue_id = :id")
				.param("id", venue.value())
				.query(Integer.class)
				.single();
	}
}
