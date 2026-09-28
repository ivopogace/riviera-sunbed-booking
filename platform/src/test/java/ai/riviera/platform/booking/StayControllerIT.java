package ai.riviera.platform.booking;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.StayFixtures.Venue;

import static ai.riviera.platform.booking.StayFixtures.PRICE;
import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code POST /api/stays} on the wire: {@code 201} with the stay's code, span, total and stretches
 * under the stub gateway; a malformed plan {@code 400 INVALID_REQUEST}; a taken day {@code 409
 * SET_TAKEN}. Session-free behind the proof-of-work fence, as the booking create. Real Postgres via
 * Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@AutoConfigureMockMvc
class StayControllerIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private static String body(long a, long b, LocalDate first) {
		return """
				{"stretches":[{"setId":%d,"firstDate":"%s","lastDate":"%s"},{"setId":%d,"firstDate":"%s","lastDate":"%s"}],
				 "contact":{"email":"stay@example.com","fullName":"Stay Guest","phone":"+355699"}}
				""".formatted(a, first, first.plusDays(2), b, first.plusDays(3), first.plusDays(6));
	}

	@Test
	void booksAPlanAndAnswersTheStay() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		long a = venue.online().get(0).value();
		long b = venue.online().get(1).value();

		mvc.perform(post("/api/stays").header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON).content(body(a, b, first)))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.code").isString())
				.andExpect(jsonPath("$.status").value("CONFIRMED"))
				.andExpect(jsonPath("$.venueId").value(venue.id()))
				.andExpect(jsonPath("$.firstDate").value(first.toString()))
				.andExpect(jsonPath("$.lastDate").value(first.plusDays(6).toString()))
				.andExpect(jsonPath("$.total.minorUnits").value(7 * PRICE))
				.andExpect(jsonPath("$.stretches.length()").value(2))
				.andExpect(jsonPath("$.stretches[0].setId").value(a))
				.andExpect(jsonPath("$.stretches[0].rowLabel").value("A"))
				.andExpect(jsonPath("$.stretches[0].positionNo").value(1))
				.andExpect(jsonPath("$.stretches[1].amount.minorUnits").value(4 * PRICE))
				.andExpect(jsonPath("$.emailWithheld").value(false));
	}

	@Test
	void aPlanAtARequestVenueIsOneRequestAnswered202WithItsDeadline() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		long a = venue.online().get(0).value();
		long b = venue.online().get(1).value();

		mvc.perform(post("/api/stays").header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON).content(body(a, b, first)))
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.code").isString())
				.andExpect(jsonPath("$.status").value("PENDING_REQUEST"))
				.andExpect(jsonPath("$.requestExpiresAt").isString())
				.andExpect(jsonPath("$.clientSecret").doesNotExist())
				.andExpect(jsonPath("$.total.minorUnits").value(7 * PRICE))
				.andExpect(jsonPath("$.stretches.length()").value(2));
	}

	@Test
	void aMalformedPlanIs400AndATakenDayIs409() throws Exception {
		Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		venues.add(venue.id());
		LocalDate first = firstDay();
		long a = venue.online().get(0).value();
		long b = venue.online().get(1).value();

		mvc.perform(post("/api/stays").header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON).content(body(a, a, first)))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		mvc.perform(post("/api/stays").header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON).content("""
				{"stretches":[],"contact":{"email":"s@e.com","fullName":"S","phone":"+355"}}"""))
				.andExpect(status().isBadRequest());

		StayFixtures.take(jdbc, venue.online().get(1), first.plusDays(4));
		mvc.perform(post("/api/stays").header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON).content(body(a, b, first)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SET_TAKEN"));
	}
}
