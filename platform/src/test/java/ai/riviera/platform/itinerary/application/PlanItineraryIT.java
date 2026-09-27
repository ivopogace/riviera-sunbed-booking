package ai.riviera.platform.itinerary.application;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

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
import ai.riviera.platform.itinerary.domain.ItinerarySearch.Anchoring;
import ai.riviera.platform.venue.IsolationBeaches;
import ai.riviera.platform.venue.vocabulary.MoneyView;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.SetPlacement;
import ai.riviera.platform.venue.vocabulary.StaySpan;
import ai.riviera.platform.venue.vocabulary.Tier;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The stitched plan through the {@link PlanItinerary} seam over real map and availability rows:
 * stretches with their placement, days and money, each move's day and distance, the anchor's role,
 * and the fences (hidden venue, maximum stay, no plan within the budget). Testcontainers Postgres,
 * fixtures isolated on {@link IsolationBeaches#STAY_PLAN_IT_BEACH}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PlanItineraryIT {

	private static final String BEACH = IsolationBeaches.STAY_PLAN_IT_BEACH;
	private static final LocalDate D1 = LocalDate.of(2026, 7, 10);
	private static final StaySpan SEVEN_DAYS = new StaySpan(D1, D1.plusDays(6));

	@Autowired
	PlanItinerary planner;

	@Autowired
	JdbcClient jdbc;

	private long venue;
	private long a1;
	private long a2;
	private long b1;
	private long hidden;
	private long capped;

	@BeforeEach
	void seedFixtures() {
		venue = insertVenue("Plan Beach", null, true);
		a1 = insertSet(venue, "A", 1, 1, 2500, "STANDARD");
		a2 = insertSet(venue, "A", 2, 1, 3000, "PREMIUM");
		b1 = insertSet(venue, "B", 1, 2, 2000, "STANDARD");
		long walkIn = insertSet(venue, "C", 1, 3, 1000, "STANDARD");
		jdbc.sql("UPDATE set_position SET pool = 'WALK_IN' WHERE id = :id").param("id", walkIn).update();
		for (int day = 3; day <= 6; day++) {
			take(a1, D1.plusDays(day));
		}
		for (int day = 0; day <= 2; day++) {
			take(a2, D1.plusDays(day));
			take(b1, D1.plusDays(day));
		}

		hidden = insertVenue("Hidden Beach", null, false);
		insertSet(hidden, "A", 1, 1, 2500, "STANDARD");

		capped = insertVenue("Capped Beach", 3, true);
		insertSet(capped, "A", 1, 1, 2500, "STANDARD");
	}

	@AfterEach
	void cleanup() {
		jdbc.sql("DELETE FROM operator_venue WHERE venue_id IN (SELECT id FROM venue WHERE beach = :b)")
				.param("b", BEACH).update();
		jdbc.sql("DELETE FROM venue WHERE beach = :b").param("b", BEACH).update();
	}

	@Test
	void plansTheFewestThenShortestMovesWithPlacementsAndMoney() {
		StayItinerary itinerary = planner.plan(new VenueId(venue), SEVEN_DAYS, Optional.empty()).orElseThrow();

		assertEquals(3, itinerary.maxMoves());
		assertEquals(Anchoring.NONE, itinerary.anchoring());
		StayPlan plan = itinerary.plan().orElseThrow();
		assertEquals(List.of(
				new PlannedStretch(new SetId(a1), new SetPlacement("A", 1, 1, 1), Tier.STANDARD, D1, D1.plusDays(2), 3,
						new MoneyView(2500, "EUR"), new MoneyView(7500, "EUR")),
				new PlannedStretch(new SetId(a2), new SetPlacement("A", 2, 2, 1), Tier.PREMIUM, D1.plusDays(3),
						D1.plusDays(6), 4, new MoneyView(3000, "EUR"), new MoneyView(12000, "EUR"))),
				plan.stretches());
		assertEquals(List.of(new PlannedMove(D1.plusDays(3), 0, 1, false)), plan.moves());
		assertEquals(new MoneyView(19500, "EUR"), plan.total());
	}

	@Test
	void anAnchorFreeOnTheLastDaysEndsThePlanARowBack() {
		StayItinerary itinerary = planner.plan(new VenueId(venue), SEVEN_DAYS, Optional.of(new SetId(b1))).orElseThrow();

		assertEquals(Anchoring.END, itinerary.anchoring());
		StayPlan plan = itinerary.plan().orElseThrow();
		assertEquals(List.of(new SetId(a1), new SetId(b1)), plan.stretches().stream().map(PlannedStretch::setId).toList());
		assertEquals(List.of(new PlannedMove(D1.plusDays(3), 1, 0, false)), plan.moves());
		assertEquals(new MoneyView(15500, "EUR"), plan.total());
	}

	@Test
	void anAnchorThatIsNotAnOnlineSetOfTheVenueIsRefused() {
		assertThrows(IllegalArgumentException.class,
				() -> planner.plan(new VenueId(venue), SEVEN_DAYS, Optional.of(new SetId(-1))));
	}

	@Test
	void aDayNoSetIsFreeOnHasNoPlan() {
		take(a2, D1.plusDays(4));
		take(b1, D1.plusDays(4));
		StayItinerary itinerary = planner.plan(new VenueId(venue), SEVEN_DAYS, Optional.empty()).orElseThrow();
		assertTrue(itinerary.plan().isEmpty());
		assertEquals(Anchoring.NONE, itinerary.anchoring());
	}

	@Test
	void aSpanOverTheMaximumStayHasNoPlan() {
		StayItinerary itinerary = planner.plan(new VenueId(capped), SEVEN_DAYS, Optional.empty()).orElseThrow();
		assertTrue(itinerary.plan().isEmpty());
		assertEquals(new StaySpan(D1, D1.plusDays(2)).days(),
				planner.plan(new VenueId(capped), new StaySpan(D1, D1.plusDays(2)), Optional.empty())
						.orElseThrow().plan().orElseThrow().stretches().getFirst().days());
	}

	@Test
	void aHiddenOrUnknownVenueIsAbsent() {
		assertEquals(Optional.empty(), planner.plan(new VenueId(hidden), SEVEN_DAYS, Optional.empty()));
		assertEquals(Optional.empty(), planner.plan(new VenueId(-1), SEVEN_DAYS, Optional.empty()));
	}

	private long insertVenue(String name, Integer maxStayDays, boolean visible) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency, max_stay_days)
				VALUES (:name, :beach, 40, 1, 'INSTANT', 1500, 'EUR', :max)
				RETURNING id
				""")
				.param("name", name).param("beach", BEACH).param("max", maxStayDays)
				.query(Long.class).single();
		if (visible) {
			OwnershipFixtures.grantToBootstrap(jdbc, id);
		}
		return id;
	}

	private long insertSet(long venueId, String row, int positionNo, int gridY, int priceMinor, String tier) {
		return jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:v, :row, :pos, :tier, 'ONLINE', :price, 'EUR', :pos, :y)
				RETURNING id
				""")
				.param("v", venueId).param("row", row).param("pos", positionNo).param("tier", tier)
				.param("price", priceMinor).param("y", gridY)
				.query(Long.class).single();
	}

	private void take(long setId, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", setId).param("date", date).update();
	}
}
