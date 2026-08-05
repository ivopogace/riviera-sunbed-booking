package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.LocalTime;
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
import ai.riviera.platform.venue.application.NewVenueCommand;
import ai.riviera.platform.venue.application.Venues;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The per-service-date rate read against real Postgres (A7, epic #348) — {@code VenueRates
 * #commissionBpsOn} over the {@code venue_commission_rate} schedule (V39), plus the seeding that
 * keeps the schedule total.
 *
 * <p>Two properties matter and neither is visible from a unit test: that the read picks the
 * <strong>latest row at or before</strong> the service date (so a scheduled future change does not
 * leak backwards into a past day — the defect this slice fixes), and that
 * {@link Venues#insertVenue} <strong>seeds a floor row</strong> so a venue onboarded after V39 is as
 * covered as one the migration backfilled. Without the seed the read would fall through for every
 * new venue exactly once a rate change landed.
 *
 * <p>Runs only when Docker is available (Testcontainers Postgres).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class JdbcVenueCommissionScheduleIT {

	private static final LocalDate EPOCH_FLOOR = LocalDate.of(1970, 1, 1);
	private static final LocalDate BEFORE_THE_CHANGE = LocalDate.of(2026, 8, 4);
	private static final LocalDate EFFECTIVE_FROM = LocalDate.of(2026, 8, 6);

	@Autowired
	VenueRates rates;
	@Autowired
	Venues venues;
	@Autowired
	CommissionRateStore commissionRates;
	@Autowired
	JdbcClient jdbc;

	@Test
	void anUnchangedVenueReadsItsOneRateOnEveryDate() {
		VenueId venue = onboarded(1500);

		assertThat(rates.commissionBpsOn(venue, BEFORE_THE_CHANGE)).hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM)).hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EPOCH_FLOOR)).hasValue(1500);
	}

	@Test
	void readsTheLatestScheduledRateAtOrBeforeTheServiceDate() {
		VenueId venue = onboarded(1500);
		schedule(venue, EFFECTIVE_FROM, 2000);

		assertThat(rates.commissionBpsOn(venue, BEFORE_THE_CHANGE))
				.as("a scheduled change must not reach backwards into a past service date")
				.hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM.minusDays(1))).hasValue(1500);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM)).hasValue(2000);
		assertThat(rates.commissionBpsOn(venue, EFFECTIVE_FROM.plusYears(1))).hasValue(2000);
	}

	@Test
	void onboardingSeedsAFloorRowSoTheScheduleStaysTotal() {
		VenueId venue = onboarded(1250);

		Integer floorRows = jdbc.sql("""
				SELECT COUNT(*) FROM venue_commission_rate
				 WHERE venue_id = :id AND effective_from = :floor AND commission_bps = 1250
				""")
				.param("id", venue.value())
				.param("floor", EPOCH_FLOOR)
				.query(Integer.class)
				.single();

		assertThat(floorRows).isEqualTo(1);
	}

	@Test
	void anUnknownVenueHasNoRate() {
		assertThat(rates.commissionBpsOn(new VenueId(-1), BEFORE_THE_CHANGE))
				.isEqualTo(OptionalInt.empty());
	}

	@Test
	void theLiveRateReadIsUnchangedByTheSchedule() {
		VenueId venue = onboarded(1500);
		schedule(venue, EFFECTIVE_FROM, 2000);

		assertThat(rates.commissionBps(venue))
				.as("the accrual path reads the live column, untouched by scheduling")
				.hasValue(1500);
	}

	private VenueId onboarded(int commissionBps) {
		return new VenueId(venues.insertVenue(new NewVenueCommand("A7 schedule venue", "Test beach",
				"Test region", null, "INSTANT", commissionBps, "EUR", LocalTime.of(18, 0))));
	}

	private void schedule(VenueId venue, LocalDate effectiveFrom, int commissionBps) {
		commissionRates.schedule(venue, effectiveFrom, commissionBps);
	}
}
