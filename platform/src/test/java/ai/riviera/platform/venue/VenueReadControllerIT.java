package ai.riviera.platform.venue;

import java.time.LocalDate;
import java.time.ZoneId;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.hamcrest.Matchers.contains;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the U1 venue read API ({@code GET /api/venues/{id}}, issue #4; date-aware since
 * issue #44) against the seeded Miramar venue: shape, integer-minor-unit money (invariant #5),
 * 404 for an unknown id, public access, and — the #44 behaviour — that each set's availability is
 * sourced per-{@code (set, date)} from {@code set_availability} (invariant #2), with the date
 * defaulting to tomorrow in {@code Europe/Tirane}. Testcontainers Postgres, so it runs in CI;
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
	void defaultsToTomorrowTirane() throws Exception {
		// AC-3: no date param ⇒ tomorrow in Europe/Tirane. Book a set for that exact date and
		// confirm the param-less read renders it TAKEN.
		long set = anyOnlineSet();
		LocalDate tomorrow = LocalDate.now(TIRANE).plusDays(1);
		book(set, tomorrow);

		mvc.perform(get("/api/venues/{id}", MIRAMAR))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.sets[?(@.id == %d)].availability", set).value(contains("TAKEN")));
	}
}
