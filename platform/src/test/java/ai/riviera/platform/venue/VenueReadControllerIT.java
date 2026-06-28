package ai.riviera.platform.venue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Verifies the U1 venue read API ({@code GET /api/venues/{id}}, issue #4) against the
 * seeded Miramar venue: shape, integer-minor-unit money (invariant #5), 404 for an unknown
 * id, and that the endpoint is public (tourist read — no auth). Testcontainers Postgres,
 * so it runs in CI; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class VenueReadControllerIT {

	private static final long MIRAMAR = 1L; // first seeded venue (identity PK)

	@Autowired
	MockMvc mvc;

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
}
