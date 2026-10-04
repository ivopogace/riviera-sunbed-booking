package ai.riviera.platform.booking;

import java.time.Duration;
import java.time.Instant;
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
import ai.riviera.platform.venue.vocabulary.SetId;

import static ai.riviera.platform.booking.StayFixtures.firstDay;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A Request-to-Book reserve refuses a retired set with the instant path's {@code 404 NO_SUCH_SET}, on
 * {@code POST /api/bookings} and {@code POST /api/stays} alike, and writes no booking (ADR-0019): a request
 * claims nothing (ADR-0025), so the claim's retired-set fence never runs for it. A booking already on the set
 * keeps resolving in the booking view under the spot the guest was told. Real Postgres via Testcontainers; the
 * set is retired directly in SQL, since retiring through the console is {@code venue}'s path.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "booking.no-show.enabled=false")
@AutoConfigureMockMvc
class RetiredSetRequestReserveIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private final List<Long> venues = new ArrayList<>();

	@AfterEach
	void removeFixtures() {
		venues.forEach(venue -> StayFixtures.cleanup(jdbc, venue));
	}

	private Venue requestVenue() {
		Venue venue = StayFixtures.venue(jdbc, "REQUEST", null, true);
		venues.add(venue.id());
		return venue;
	}

	private void retire(SetId set) {
		jdbc.sql("UPDATE set_position SET retired_at = now() WHERE id = :id").param("id", set.value()).update();
	}

	private long bookingsAt(Venue venue) {
		return jdbc.sql("SELECT COUNT(*) FROM booking WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single();
	}

	private long staysAt(Venue venue) {
		return jdbc.sql("SELECT COUNT(*) FROM stay WHERE venue_id = :v").param("v", venue.id())
				.query(Long.class).single();
	}

	@Test
	void aRequestBookingOnARetiredSetIsNoSuchSet() throws Exception {
		Venue venue = requestVenue();
		SetId retired = venue.online().getFirst();
		retire(retired);
		LocalDate day = firstDay();

		mvc.perform(post("/api/bookings")
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"setId": %d, "bookingDate": "%s",
						 "contact": {"email": "retired-request@example.com", "fullName": "Retired Guest", "phone": "+355699"}}
						""".formatted(retired.value(), day)))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
		assertEquals(0L, bookingsAt(venue), "a refused request writes no booking, so no mail follows");
	}

	@Test
	void aRequestStayWithARetiredStretchIsNoSuchSet() throws Exception {
		Venue venue = requestVenue();
		SetId retired = venue.online().get(0);
		SetId active = venue.online().get(1);
		retire(retired);
		LocalDate first = firstDay();

		mvc.perform(post("/api/stays")
				.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
				.contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"stretches":[{"setId":%d,"firstDate":"%s","lastDate":"%s"},{"setId":%d,"firstDate":"%s","lastDate":"%s"}],
						 "contact":{"email":"retired-stay@example.com","fullName":"Retired Guest","phone":"+355699"}}
						""".formatted(active.value(), first, first.plusDays(1), retired.value(), first.plusDays(2),
						first.plusDays(3))))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.code").value("NO_SUCH_SET"));
		assertEquals(0L, bookingsAt(venue), "a refused stay writes no stretch");
		assertEquals(0L, staysAt(venue), "a refused stay writes no stay");
	}

	@Test
	void aBookingAlreadyOnTheSetStillResolvesAfterItRetires() throws Exception {
		Venue venue = requestVenue();
		SetId set = venue.online().getFirst();
		String code = "RSRV" + System.nanoTime();
		StayFixtures.insertPendingLone(jdbc, venue, code, set, firstDay(), firstDay(),
				Instant.now().plus(Duration.ofHours(12)));
		retire(set);

		mvc.perform(get("/api/bookings/{code}", code)
				.header("X-Forwarded-For", SessionLoginSupport.uniqueClientIp()))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.rowLabel").value("A"))
				.andExpect(jsonPath("$.positionNo").value(1));
	}
}
