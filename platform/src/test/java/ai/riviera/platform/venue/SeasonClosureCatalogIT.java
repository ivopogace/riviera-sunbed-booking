package ai.riviera.platform.venue;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The season closure inside the tourist catalogue, at the HTTP seam with a movable clock: the list
 * badges and sorts a closed venue last, the map and the calendar read every date unsellable, the
 * opt-in opens dates on or after the reopen day, and the venue reopens by itself the moment that day
 * starts in {@code Europe/Tirane} — with nothing written. The reviews page keeps answering. Four
 * venues on one private beach; all removed again afterwards.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, SeasonClosureCatalogIT.ClockOverride.class})
@SpringBootTest(properties = "booking.no-show.enabled=false")
@AutoConfigureMockMvc
class SeasonClosureCatalogIT {

	private static final String BEACH = "Season closure beach IT";
	private static final LocalDate REOPEN = LocalDate.of(2027, 5, 15);
	/** 2027-05-14 23:59 in Tirane (CEST): the closure's last minute. */
	private static final Instant BEFORE_REOPEN = Instant.parse("2027-05-14T21:59:00Z");
	/** 2027-05-15 00:00 in Tirane — still the 14th in UTC, which is the trap this pins (invariant #6). */
	private static final Instant AT_REOPEN = Instant.parse("2027-05-14T22:00:00Z");
	/** 2027-05-13 08:00 in Tirane: two days out, every venue's on-day sales close still ahead. */
	private static final Instant TWO_MORNINGS_BEFORE = Instant.parse("2027-05-13T06:00:00Z");

	@TestConfiguration(proxyBeanMethods = false)
	static class ClockOverride {
		@Bean
		@Primary
		MovableClock movableClock() {
			return new MovableClock(BEFORE_REOPEN);
		}
	}

	/** A clock the test moves by hand; every reader sees the same instant until it is moved. */
	static final class MovableClock extends Clock {
		private volatile Instant now;

		MovableClock(Instant now) {
			this.now = now;
		}

		void set(Instant instant) {
			now = instant;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return Clock.fixed(now, zone);
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MovableClock clock;

	private final List<Long> venues = new ArrayList<>();
	private long open;
	private long closedUntilReopen;
	private long sellingAhead;
	private long closedIndefinitely;

	@BeforeEach
	void seedTheBeach() {
		clock.set(BEFORE_REOPEN);
		// The closed venues outrank the open one, so only the closed-last rule can put them after it.
		open = venue("Season Open IT", 10, null, null, false);
		closedUntilReopen = venue("Season Closed IT", 50, BEFORE_REOPEN, REOPEN, false);
		sellingAhead = venue("Season Selling Ahead IT", 40, BEFORE_REOPEN, REOPEN, true);
		closedIndefinitely = venue("Season Indefinite IT", 30, BEFORE_REOPEN, null, false);
	}

	@AfterEach
	void removeTheBeach() {
		for (long venue : venues) {
			jdbc.sql("DELETE FROM set_position WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :v").param("v", venue).update();
			jdbc.sql("DELETE FROM venue WHERE id = :v").param("v", venue).update();
		}
	}


	@Test
	void theListBadgesClosedVenuesAndSortsThemAfterOpenOnes() throws Exception {
		mvc.perform(get("/api/venues").param("beach", BEACH).param("date", REOPEN.plusDays(5).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[*].id").value(contains(
						(int) open, (int) closedUntilReopen, (int) sellingAhead, (int) closedIndefinitely)))
				.andExpect(jsonPath(venue(open) + ".closedForSeason").value(contains(false)))
				.andExpect(jsonPath(venue(open) + ".salesOpen").value(contains(true)))
				.andExpect(jsonPath(venue(closedUntilReopen) + ".closedForSeason").value(contains(true)))
				.andExpect(jsonPath(venue(closedUntilReopen) + ".reopensOn").value(contains(REOPEN.toString())))
				.andExpect(jsonPath(venue(closedUntilReopen) + ".salesOpen").value(contains(false)))
				.andExpect(jsonPath(venue(sellingAhead) + ".closedForSeason").value(contains(true)))
				.andExpect(jsonPath(venue(sellingAhead) + ".salesOpen").value(contains(true)))
				.andExpect(jsonPath(venue(closedIndefinitely) + ".closedForSeason").value(contains(true)))
				.andExpect(jsonPath(venue(closedIndefinitely) + ".reopensOn").value(contains(nullValue())))
				.andExpect(jsonPath(venue(closedIndefinitely) + ".salesOpen").value(contains(false)));
	}

	@Test
	void theOptInSellsNothingBeforeTheReopenDay() throws Exception {
		clock.set(TWO_MORNINGS_BEFORE);
		mvc.perform(get("/api/venues").param("beach", BEACH).param("date", REOPEN.minusDays(1).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath(venue(sellingAhead) + ".salesOpen").value(contains(false)))
				.andExpect(jsonPath(venue(open) + ".salesOpen").value(contains(true)));
	}

	@Test
	void theVenueReopensByItselfWhenTheReopenDayStartsInTirane() throws Exception {
		clock.set(AT_REOPEN);
		mvc.perform(get("/api/venues").param("beach", BEACH).param("date", REOPEN.plusDays(5).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath(venue(closedUntilReopen) + ".closedForSeason").value(contains(false)))
				.andExpect(jsonPath(venue(closedUntilReopen) + ".reopensOn").value(contains(nullValue())))
				.andExpect(jsonPath(venue(closedUntilReopen) + ".salesOpen").value(contains(true)))
				.andExpect(jsonPath(venue(sellingAhead) + ".closedForSeason").value(contains(false)))
				.andExpect(jsonPath(venue(closedIndefinitely) + ".closedForSeason").value(contains(true)))
				.andExpect(jsonPath("$[*].id").value(contains(
						(int) closedUntilReopen, (int) sellingAhead, (int) open, (int) closedIndefinitely)));
		Integer stillStamped = jdbc.sql("SELECT COUNT(*) FROM venue WHERE id = :v AND closed_at IS NOT NULL")
				.param("v", closedUntilReopen).query(Integer.class).single();
		org.junit.jupiter.api.Assertions.assertEquals(1, stillStamped, "reads compare dates; nothing sweeps");
	}

	@Test
	void theMapStaysBrowsableWithEveryDateUnsellable() throws Exception {
		mvc.perform(get("/api/venues/{id}", closedUntilReopen).param("date", REOPEN.plusDays(5).toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets.length()").value(1))
				.andExpect(jsonPath("$.closedForSeason").value(true))
				.andExpect(jsonPath("$.reopensOn").value(REOPEN.toString()))
				.andExpect(jsonPath("$.salesOpen").value(false));
		mvc.perform(get("/api/venues/{id}", sellingAhead).param("date", REOPEN.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.closedForSeason").value(true))
				.andExpect(jsonPath("$.salesOpen").value(true));
		clock.set(AT_REOPEN);
		mvc.perform(get("/api/venues/{id}", closedUntilReopen).param("date", REOPEN.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.closedForSeason").value(false))
				.andExpect(jsonPath("$.reopensOn").value(nullValue()))
				.andExpect(jsonPath("$.salesOpen").value(true));
	}

	@Test
	void theCalendarMarksEveryDayUnsellableUntilTheOptInOpensTheReopenDay() throws Exception {
		clock.set(TWO_MORNINGS_BEFORE);
		String from = REOPEN.minusDays(2).toString();
		String to = REOPEN.plusDays(2).toString();
		mvc.perform(get("/api/venues/{id}/availability-calendar", closedUntilReopen)
						.param("from", from).param("to", to))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[*].salesOpen").value(contains(false, false, false, false, false)))
				.andExpect(jsonPath("$[*].free").value(contains(1, 1, 1, 1, 1)));
		mvc.perform(get("/api/venues/{id}/availability-calendar", sellingAhead)
						.param("from", from).param("to", to))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[*].salesOpen").value(contains(false, false, true, true, true)));
		mvc.perform(get("/api/venues/{id}/availability-calendar", open)
						.param("from", from).param("to", to))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[*].salesOpen").value(contains(true, true, true, true, true)));
	}

	@Test
	void theReviewsPageKeepsAnswering() throws Exception {
		mvc.perform(get("/api/venues/{id}/reviews", closedUntilReopen))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.reviews").isArray());
	}

	private static String venue(long id) {
		return "$[?(@.id == %d)]".formatted(id);
	}

	private long venue(String name, int ratingTenths, Instant closedAt, LocalDate reopenOn, boolean advanceSales) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, rating_tenths, reviews_count, booking_mode,
				                   commission_bps, payout_currency, closed_at, reopen_on, advance_sales)
				VALUES (:name, :beach, 'Season region IT', :rating, 3, 'INSTANT', 1500, 'EUR',
				        :closedAt, :reopenOn, :advanceSales)
				RETURNING id
				""")
				.param("name", name).param("beach", BEACH).param("rating", ratingTenths)
				.param("closedAt", closedAt == null ? null : closedAt.atOffset(ZoneOffset.UTC))
				.param("reopenOn", reopenOn).param("advanceSales", advanceSales)
				.query(Long.class).single();
		jdbc.sql("""
				INSERT INTO set_position (venue_id, row_label, position_no, tier, pool, price_minor,
				                          price_currency, grid_x, grid_y)
				VALUES (:venue, 'A', 1, 'STANDARD', 'ONLINE', 4500, 'EUR', 1, 1)
				""").param("venue", id).update();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		venues.add(id);
		return id;
	}
}
