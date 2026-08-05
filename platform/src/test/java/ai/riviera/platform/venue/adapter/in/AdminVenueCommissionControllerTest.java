package ai.riviera.platform.venue.adapter.in;

import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import ai.riviera.platform.ApiErrorHandler;
import ai.riviera.platform.venue.application.CommissionRateCommand;
import ai.riviera.platform.venue.application.VenueCommissionAdministration;
import ai.riviera.platform.venue.application.VenueCommissionView;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The wire contract of the admin commission endpoints (A7, epic #348): the list shape, and the write's
 * three answers — {@code 200} with the updated venue, {@code 404 NO_SUCH_VENUE}, and
 * {@code 400 INVALID_REQUEST} for a rate the range guard rejects.
 *
 * <p>Standalone MockMvc over a stubbed port, so this pins <strong>mapping and status</strong> only:
 * the forward-only scheduling is {@code VenueCommissionServiceTest}'s and the ADMIN gate is
 * {@code AdminVenueCommissionIT}'s. Errors go through the one {@link ApiErrorHandler} advice (#97) —
 * registered here precisely so a per-controller handler would show up as a difference.
 *
 * <p><strong>Why absence and zero are tested separately.</strong> Zero basis points is a legitimate
 * rate (a venue the platform takes nothing from), so a missing field must not be readable as one; the
 * DTO's boxed {@code Integer} is what keeps them distinct, and these two cases are what would catch a
 * future change to a primitive.
 */
class AdminVenueCommissionControllerTest {

	private static final String COMMISSION_PATH = "/api/admin/venues/{venueId}/commission";

	private Optional<VenueCommissionView> writeOutcome;
	private List<VenueCommissionView> listed;
	private CommissionRateCommand received;
	private MockMvc mvc;

	@BeforeEach
	void setUp() {
		writeOutcome = Optional.empty();
		listed = List.of();
		received = null;
		VenueCommissionAdministration stub = new VenueCommissionAdministration() {
			@Override
			public List<VenueCommissionView> venueCommissions() {
				return listed;
			}

			@Override
			public Optional<VenueCommissionView> setCommission(VenueId venueId,
					CommissionRateCommand command) {
				received = command;
				return writeOutcome;
			}
		};
		mvc = MockMvcBuilders.standaloneSetup(new AdminVenueCommissionController(stub))
				.setControllerAdvice(new ApiErrorHandler())
				.build();
	}

	@Test
	void listsVenuesWithTheirRatesInThePortsOrder() throws Exception {
		listed = List.of(new VenueCommissionView(2, "Aurora", "Dhermi", 1000, "EUR"),
				new VenueCommissionView(3, "Sunset", "Ksamil", 1500, "EUR"));

		mvc.perform(get("/api/admin/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venues.length()").value(2))
				.andExpect(jsonPath("$.venues[0].venueId").value(2))
				.andExpect(jsonPath("$.venues[0].name").value("Aurora"))
				.andExpect(jsonPath("$.venues[0].beach").value("Dhermi"))
				.andExpect(jsonPath("$.venues[0].commissionBps").value(1000))
				.andExpect(jsonPath("$.venues[0].payoutCurrency").value("EUR"))
				.andExpect(jsonPath("$.venues[1].commissionBps").value(1500));
	}

	@Test
	void anEmptyPlatformListsNoVenuesRatherThanNotFound() throws Exception {
		mvc.perform(get("/api/admin/venues"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venues").isEmpty());
	}

	@Test
	void answersTheUpdatedVenueOnAWrite() throws Exception {
		writeOutcome = Optional.of(new VenueCommissionView(3, "Sunset", "Ksamil", 2000, "EUR"));

		mvc.perform(put(COMMISSION_PATH, 3).contentType(MediaType.APPLICATION_JSON)
						.content("{\"commissionBps\":2000}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.venueId").value(3))
				.andExpect(jsonPath("$.commissionBps").value(2000));

		assertEquals(2000, received.commissionBps(), "the wire integer reaches the command unchanged");
	}

	@Test
	void anUnknownVenueIsNotFoundWithAStableCode() throws Exception {
		mvc.perform(put(COMMISSION_PATH, 404).contentType(MediaType.APPLICATION_JSON)
						.content("{\"commissionBps\":2000}"))
				.andExpect(status().isNotFound())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.code").value("NO_SUCH_VENUE"));
	}

	@Test
	void rejectsOutOfRangeAndMissingBasisPoints() throws Exception {
		for (String body : List.of("{\"commissionBps\":10001}", "{\"commissionBps\":-1}", "{}")) {
			mvc.perform(put(COMMISSION_PATH, 3).contentType(MediaType.APPLICATION_JSON).content(body))
					.andExpect(status().isBadRequest())
					.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
					.andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
		}
		assertNull(received, "a rejected rate never reaches the port, so nothing is written");
	}

	@Test
	void acceptsBothEndsOfTheBasisPointRange() throws Exception {
		writeOutcome = Optional.of(new VenueCommissionView(3, "Sunset", "Ksamil", 0, "EUR"));
		mvc.perform(put(COMMISSION_PATH, 3).contentType(MediaType.APPLICATION_JSON)
						.content("{\"commissionBps\":0}"))
				.andExpect(status().isOk());
		assertEquals(0, received.commissionBps(), "zero commission is a rate, not a missing field");

		mvc.perform(put(COMMISSION_PATH, 3).contentType(MediaType.APPLICATION_JSON)
						.content("{\"commissionBps\":10000}"))
				.andExpect(status().isOk());
		assertEquals(10_000, received.commissionBps());
	}
}
