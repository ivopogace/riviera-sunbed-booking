package ai.riviera.platform.venue;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.BookingMode;
import ai.riviera.platform.venue.vocabulary.SetId;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * AC-4: changing a venue's booking mode via the widened profile write flips the
 * tourist booking flow. The reserve path branches on {@code SetBookingInfo.bookingMode}, resolved
 * <em>live</em> per booking attempt from {@code venue.booking_mode} — so flipping the mode changes
 * whether a subsequent reserve auto-confirms ({@code INSTANT}) or starts as a pending request
 * ({@code REQUEST}). This IT proves the write-to-booking-visibility link end to end (that
 * {@code REQUEST} then produces a pending request is existing Request-to-Book coverage). Real
 * Postgres via Testcontainers.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "riviera.operator.password=test-operator-pw")
@AutoConfigureMockMvc
class BookingModeSwitchIT {

	private static final String OPERATOR = "operator";
	private static final String PASSWORD = "test-operator-pw";

	@Autowired
	MockMvc mvc;

	@Autowired
	SetBookingFacts setFacts;

	private Cookie operatorSession;

	@BeforeEach
	void logIn() throws Exception {
		operatorSession = SessionLoginSupport.operatorSession(mvc, OPERATOR, PASSWORD);
	}

	@Test
	void editingBookingModeToRequestIsVisibleToBooking() throws Exception {
		long venue = createVenue("Mode Switch Club");
		long setId = addOnlineSet(venue);

		// Booking sees INSTANT before the edit (the venue was created INSTANT).
		assertEquals(BookingMode.INSTANT,
				setFacts.setBookingInfo(new SetId(setId)).orElseThrow().bookingMode());

		// The operator flips the venue to REQUEST via the widened profile write.
		mvc.perform(patch("/api/venues/{v}", venue).cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"Mode Switch Club","beach":"Ksamil","region":"Riviera",
								 "description":"x","bookingMode":"REQUEST","bookingCutoff":"18:00",
								 "salesClose":"16:00","amenities":[],"distanceToWaterM":null,
								 "expectedVersion":0}
								"""))
				.andExpect(status().isNoContent());

		// Booking now sees REQUEST — the reserve flow will start the booking as a pending request.
		assertEquals(BookingMode.REQUEST,
				setFacts.setBookingInfo(new SetId(setId)).orElseThrow().bookingMode());
	}

	private long createVenue(String name) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues").cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"name":"%s","beach":"Ksamil","region":"Riviera","description":"x",
								 "bookingMode":"INSTANT","payoutCurrency":"EUR",
								 "bookingCutoff":"18:00"}
								""".formatted(name)))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private long addOnlineSet(long venueId) throws Exception {
		MvcResult result = mvc.perform(post("/api/venues/{v}/sets", venueId)
						.cookie(operatorSession).with(csrf())
						.contentType(MediaType.APPLICATION_JSON)
						.content("""
								{"rowLabel":"Row A","positionNo":1,"tier":"PREMIUM","pool":"ONLINE",
								 "price":{"minorUnits":4500,"currency":"EUR"},"gridX":1,"gridY":1}
								"""))
				.andExpect(status().isCreated())
				.andReturn();
		return idFrom(result);
	}

	private static long idFrom(MvcResult result) throws Exception {
		String json = result.getResponse().getContentAsString();
		return Long.parseLong(com.jayway.jsonpath.JsonPath.read(json, "$.id").toString());
	}
}
