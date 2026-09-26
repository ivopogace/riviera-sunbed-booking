package ai.riviera.platform.itinerary.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.itinerary.domain.StayVerdict;
import ai.riviera.platform.venue.IsolationBeaches;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The coast verdict at the {@link StayVerdicts} seam over real map and availability rows
 * (Testcontainers Postgres): a same-set venue, a can't-host venue with its longest run, and a venue
 * whose maximum stay is too short; a walk-in set never counts (invariant #3). Fixtures are
 * isolated on {@link IsolationBeaches#STAY_VERDICT_IT_BEACH}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class StayVerdictsIT {

	private static final String BEACH = IsolationBeaches.STAY_VERDICT_IT_BEACH;
	private static final LocalDate D1 = LocalDate.of(2026, 7, 10);
	private static final StaySpan FOUR_DAYS = new StaySpan(D1, D1.plusDays(3));

	@Autowired
	StayVerdicts verdicts;

	@Autowired
	JdbcClient jdbc;

	private long sameSet;
	private long cannotHost;
	private long tooLong;

	@BeforeEach
	void seedFixtures() {
		sameSet = insertVenue("Same Set Beach", null);
		long a1 = insertSet(sameSet, 1, "ONLINE");
		insertSet(sameSet, 2, "ONLINE");
		long a3 = insertSet(sameSet, 3, "ONLINE");
		long walkIn = insertSet(sameSet, 4, "WALK_IN");
		take(a1, D1.plusDays(1));
		take(a3, D1.plusDays(2));
		take(a3, D1.plusDays(3));

		cannotHost = insertVenue("Cannot Host Beach", null);
		long b1 = insertSet(cannotHost, 1, "ONLINE");
		long b2 = insertSet(cannotHost, 2, "ONLINE");
		take(b1, D1.plusDays(3));
		take(b2, D1);
		take(b2, D1.plusDays(2));
		for (int day = 0; day < 4; day++) {
			take(walkIn, D1.plusDays(day));
		}

		tooLong = insertVenue("Too Long Beach", 2);
		insertSet(tooLong, 1, "ONLINE");
	}

	@AfterEach
	void cleanup() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (SELECT id FROM venue WHERE beach = :b)")
				.param("b", BEACH).update();
		jdbc.sql("DELETE FROM venue WHERE beach = :b").param("b", BEACH).update();
	}

	@Test
	void sameSetCannotHostAndTooLongVerdicts() {
		Map<VenueId, StayVerdict> byVenue = verdicts.forCoast(
				List.of(new VenueId(sameSet), new VenueId(cannotHost), new VenueId(tooLong)), FOUR_DAYS);

		assertEquals(new StayVerdict(StayVerdict.Fit.SAME_SET, 1, 4, null), byVenue.get(new VenueId(sameSet)));
		assertEquals(new StayVerdict(StayVerdict.Fit.CANNOT_HOST, 0, 3, null),
				byVenue.get(new VenueId(cannotHost)));
		assertEquals(new StayVerdict(StayVerdict.Fit.CANNOT_HOST, 1, 4, 2), byVenue.get(new VenueId(tooLong)));
	}

	@Test
	void anUnknownVenueIsAbsentAndAnEmptyCoastReadsNothing() {
		assertEquals(Map.of(), verdicts.forCoast(List.of(), FOUR_DAYS));
		assertEquals(Map.of(), verdicts.forCoast(List.of(new VenueId(-1)), FOUR_DAYS));
	}

	private long insertVenue(String name, Integer maxStayDays) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency, max_stay_days)
				VALUES (:name, :beach, 40, 1, 'INSTANT', 1500, 'EUR', :max)
				RETURNING id
				""")
				.param("name", name).param("beach", BEACH).param("max", maxStayDays)
				.query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return id;
	}

	private long insertSet(long venueId, int positionNo, String pool) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, 'A', :pos, 'STANDARD', :pool, 2500, 'EUR', :pos, 1)
				RETURNING id
				""")
				.param("v", venueId).param("pos", positionNo).param("pool", pool)
				.query(Long.class).single();
	}

	private void take(long setId, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", setId).param("date", date).update();
	}
}
