package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.OwnershipFixtures;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.empty;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the venue read API ({@code GET /api/venues/{id}}, date-aware) against the seeded
 * Miramar venue: shape, integer-minor-unit money (invariant #5), 404 for an unknown id, public
 * access, and — the date-aware behaviour — that each set's availability is sourced
 * per-{@code (set, date)} from {@code set_availability} (invariant #2), with the date
 * defaulting to today in {@code Europe/Tirane}. Testcontainers Postgres, so it runs in CI;
 * skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class VenueReadControllerIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)
	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	/** A free ONLINE set on the Miramar map, returned as its id. */
	private long anyOnlineSet() {
		return jdbc.sql("SELECT id FROM set_position WHERE venue_id = :v AND pool = 'ONLINE' "
				+ "ORDER BY id LIMIT 1").param("v", MIRAMAR).query(Long.class).single();
	}

	private void book(long setId, LocalDate date) {
		jdbc.sql("INSERT INTO set_availability (set_id, booking_date, state) "
				+ "VALUES (:id, :date, 'BOOKED_ONLINE')")
				.param("id", setId).param("date", date).update();
	}

	@Test
	void returnsVenueWithSets() throws Exception {
		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value((int) MIRAMAR))
				.andExpect(jsonPath("$.name").value("Miramar Beach Club"))
				.andExpect(jsonPath("$.beach").value("Ksamil"))
				.andExpect(jsonPath("$.ratingTenths").value(48))
				.andExpect(jsonPath("$.bookingMode").value("INSTANT"))
				.andExpect(jsonPath("$.sets.length()").value(24));
	}

	@Test
	void pricesAreIntegerMinorUnits() throws Exception {
		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.fromPrice.minorUnits").value(2500))
				.andExpect(jsonPath("$.fromPrice.currency").value("EUR"))
				.andExpect(jsonPath("$.sets[0].price.minorUnits").isNumber())
				.andExpect(jsonPath("$.sets[0].price.currency").value("EUR"));
	}

	@Test
	void unknownVenueReturns404() throws Exception {
		mvc.perform(get("/api/venues/{id}", 999_999L))
				.andExpect(status().isNotFound());
	}

	@Test
	void mapReadCarriesSetVersion() throws Exception {
		// AC-7: the venue map read carries the layout's optimistic-concurrency stamp (set_version), so a stale write is rejected (409) rather than clobbering the layout.
		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.setVersion").value(0));
	}

	@Test
	void endpointIsPublic() throws Exception {
		// No auth header → still 200, not 401: the tourist read endpoint is permitted.
		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk());
	}

	@Test
	void unbookedSetIsFreeForDate() throws Exception {
		// AC-1: with no set_availability row for the date, the set is FREE (sourced from the
		// authoritative table, not the dropped seed column).
		long set = anyOnlineSet();
		LocalDate date = LocalDate.of(2026, 11, 20);

		mvc.perform(get("/api/venues/{id}", MIRAMAR).param("date", date.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[?(@.id == %d)].availability", set).value(contains("FREE")));
	}

	@Test
	void bookedSetIsTakenOnItsDateAndFreeOnAnother() throws Exception {
		// AC-2: a set booked for D shows TAKEN for D and FREE for a different date.
		long set = anyOnlineSet();
		LocalDate date = LocalDate.of(2026, 11, 21);
		LocalDate otherDate = LocalDate.of(2026, 11, 22);
		book(set, date);

		mvc.perform(get("/api/venues/{id}", MIRAMAR).param("date", date.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[?(@.id == %d)].availability", set).value(contains("TAKEN")));

		mvc.perform(get("/api/venues/{id}", MIRAMAR).param("date", otherDate.toString()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[?(@.id == %d)].availability", set).value(contains("FREE")));
	}

	@Test
	void defaultsToTodayTirane() throws Exception {
		// AC-3: no date param ⇒ today in Europe/Tirane. Book a set for that exact date and
		// confirm the param-less read renders it TAKEN.
		long set = anyOnlineSet();
		LocalDate today = LocalDate.now(TIRANE);
		book(set, today);

		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[?(@.id == %d)].availability", set).value(contains("TAKEN")));
	}

	@Test
	void detailCarriesAmenitiesAndDistance() throws Exception {
		// AC-2: amenities inserted OUT of catalogue order (SHOWERS, BEACH_BAR,
		// FREE_PARKING) must come back in canonical catalogue order (BEACH_BAR, FREE_PARKING,
		// SHOWERS); the optional distance renders as an integer.
		long id = insertVenueWithAmenities(15, "SHOWERS", "BEACH_BAR", "FREE_PARKING");
		try {
			mvc.perform(get("/api/venues/{id}", id))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.distanceToWaterM").value(15))
					.andExpect(jsonPath("$.amenities")
							.value(contains("BEACH_BAR", "FREE_PARKING", "SHOWERS")));
		} finally {
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :id").param("id", id).update();
			jdbc.sql("DELETE FROM venue WHERE id = :id").param("id", id).update();
		}
	}

	@Test
	void absentAmenitiesAreEmptyAndNullDistance() throws Exception {
		// AC-3: the seeded Miramar venue has no amenities and no stated distance, so the
		// read renders an empty array and a null distance — the card/map look exactly like today.
		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.amenities").value(empty()))
				.andExpect(jsonPath("$.distanceToWaterM").value(nullValue()));
	}

	@Test
	void mapCarriesSalesOpenForSelectedDate() throws Exception {
		// #793 AC-3: a 00:01 opt-out venue's map reads closed for today, open for tomorrow.
		LocalTime now = LocalTime.now(TIRANE);
		Assumptions.assumeTrue(now.isAfter(LocalTime.of(0, 2)) && now.isBefore(LocalTime.of(23, 58)),
				"skipped near midnight — today would roll over or the verdict flip mid-test");
		long id = insertOptOutVenue();
		LocalDate today = LocalDate.now(TIRANE);
		try {
			mvc.perform(get("/api/venues/{id}", id).param("date", today.toString()))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.salesOpen").value(false));

			mvc.perform(get("/api/venues/{id}", id).param("date", today.plusDays(1).toString()))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.salesOpen").value(true));
		} finally {
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :id").param("id", id).update();
			jdbc.sql("DELETE FROM venue WHERE id = :id").param("id", id).update();
		}
	}

	@Test
	void mapCarriesSalesCloseValue() throws Exception {
		// #804 AC-1: the venue's own close value rides beside the salesOpen verdict, as HH:mm.
		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.salesClose").value("16:00"));

		long id = insertOptOutVenue();
		try {
			mvc.perform(get("/api/venues/{id}", id))
					.andExpect(status().isOk())
					.andExpect(jsonPath("$.salesClose").value("00:01"));
		} finally {
			jdbc.sql("DELETE FROM operator_venue WHERE venue_id = :id").param("id", id).update();
			jdbc.sql("DELETE FROM venue WHERE id = :id").param("id", id).update();
		}
	}

	/** A visible venue at the 00:01 sales-close opt-out — deterministically closed for today. */
	private long insertOptOutVenue() {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   sales_close)
				VALUES ('Sales-closed map venue IT', 'Sales close beach IT', 'Sales close IT region',
				        'INSTANT', 1500, 'EUR', '00:01')
				RETURNING id
				""").query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		return id;
	}

	/** Owned by the bootstrap ACTIVE operator — the tourist map read hides ownerless venues (#693). */
	private long insertVenueWithAmenities(int distanceToWaterM, String... amenities) {
		long id = jdbc.sql("""
				INSERT INTO venue (name, beach, region, booking_mode, commission_bps, payout_currency,
				                   distance_to_water_m)
				VALUES ('T7 detail venue', 'Amenity beach IT', 'T7 read IT region', 'INSTANT', 1500,
				        'EUR', :d)
				RETURNING id
				""").param("d", distanceToWaterM).query(Long.class).single();
		OwnershipFixtures.grantToBootstrap(jdbc, id);
		for (String amenity : amenities) {
			jdbc.sql("INSERT INTO venue_amenity (venue_id, amenity) VALUES (:v, :a)")
					.param("v", id).param("a", amenity).update();
		}
		return id;
	}
}
