package ai.riviera.platform.booking;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import com.jayway.jsonpath.JsonPath;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for {@code POST /api/bookings} (U3, issue #6): 201 + code/amount on success
 * (AC-1/8), 409 for a taken set (AC-2), 422 for a walk-in-pool set (AC-4) and a past-cutoff
 * date (AC-5), 404 for an unknown set, 400 for a malformed body, and that the endpoint is
 * public (guest checkout, no auth). Testcontainers Postgres + the real flow with the stub
 * gateway.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class BookingControllerIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	private long onlineSet() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private long walkInSet() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'WALK_IN' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private String body(long setId, LocalDate date) {
		return """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "h@e.com", "fullName": "Holiday Guest", "phone": "+355699"}}
				""".formatted(setId, date);
	}

	private static LocalDate bookable() {
		return LocalDate.now().plusYears(1);
	}

	@Test
	void createsConfirmedBooking() throws Exception {
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(onlineSet(), bookable())))
				.andExpect(status().isCreated())
				.andExpect(jsonPath("$.status").value("CONFIRMED"))
				.andExpect(jsonPath("$.code").isNotEmpty())
				.andExpect(jsonPath("$.amount.minorUnits").isNumber())
				.andExpect(jsonPath("$.amount.currency").value("EUR"));
	}

	@Test
	void takenSetReturns409() throws Exception {
		long set = onlineSet();
		LocalDate date = bookable().plusDays(2);
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
				.content(body(set, date))).andExpect(status().isCreated());

		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(set, date)))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error").value("SET_TAKEN"));
	}

	@Test
	void walkInPoolReturns422() throws Exception {
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(walkInSet(), bookable().plusDays(3))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.error").value("SET_NOT_BOOKABLE_ONLINE"));
	}

	@Test
	void afterCutoffReturns422() throws Exception {
		// Yesterday — the evening-before cutoff has long passed (invariant #4).
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(onlineSet(), LocalDate.now().minusDays(1))))
				.andExpect(status().isUnprocessableEntity())
				.andExpect(jsonPath("$.error").value("BOOKING_CLOSED"));
	}

	@Test
	void unknownSetReturns404() throws Exception {
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(999_999L, bookable())))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error").value("NO_SUCH_SET"));
	}

	@Test
	void malformedBodyReturns400() throws Exception {
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content("{\"setId\": null}"))
				.andExpect(status().isBadRequest());
	}

	private String createAndGetCode(long setId, LocalDate date) throws Exception {
		String response = mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(setId, date)))
				.andExpect(status().isCreated())
				.andReturn().getResponse().getContentAsString();
		return JsonPath.read(response, "$.code");
	}

	@Test
	void cancelConfirmedReturns200WithRefund() throws Exception {
		String code = createAndGetCode(onlineSet(), bookable().plusDays(5));

		mvc.perform(post("/api/bookings/{code}/cancel", code))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.status").value("CANCELLED"))
				.andExpect(jsonPath("$.tier").value("FULL"))
				.andExpect(jsonPath("$.refund.minorUnits").isNumber())
				.andExpect(jsonPath("$.refund.currency").value("EUR"));
	}

	@Test
	void cancelUnknownReturns404() throws Exception {
		mvc.perform(post("/api/bookings/{code}/cancel", "NOSUCHCODE"))
				.andExpect(status().isNotFound())
				.andExpect(jsonPath("$.error").value("NO_SUCH_BOOKING"));
	}

	@Test
	void cancelAlreadyCancelledReturns409() throws Exception {
		String code = createAndGetCode(onlineSet(), bookable().plusDays(6));
		mvc.perform(post("/api/bookings/{code}/cancel", code)).andExpect(status().isOk());

		mvc.perform(post("/api/bookings/{code}/cancel", code))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.error").value("NOT_CANCELLABLE"));
	}

	@Test
	void endpointIsPublic() throws Exception {
		// No auth header → not 401. Guest checkout is permitted (and CSRF is exempt for it).
		mvc.perform(post("/api/bookings").contentType(MediaType.APPLICATION_JSON)
						.content(body(onlineSet(), bookable().plusDays(4))))
				.andExpect(status().isCreated());
	}
}
