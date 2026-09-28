package ai.riviera.platform;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.PendingRequest;
import ai.riviera.platform.booking.application.request.PendingRequests;
import ai.riviera.platform.booking.application.request.RespondToRequest;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.vocabulary.StayId;
import ai.riviera.platform.venue.vocabulary.SetId;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-slice cover for the request-queue rejections. Only {@code PAYMENT_INIT_FAILED} was genuinely
 * unpinned — it had a service test on the outcome enum and no HTTP-level test at all. The two
 * {@code REQUEST_NOT_PENDING} arms are already covered by {@code WithdrawRequestIT}; they are
 * repeated here because that class is {@code @EnabledIfDockerAvailable}, so without these the pair
 * has no cover on a leg with no Docker daemon.
 *
 * <p>Both arms assert {@code RequestProblemDetails.NOT_PENDING}, the one constant all three call
 * sites share.
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class BookingRequestControllerTest {

	private static final String ACCEPT = "/api/venues/{venueId}/booking-requests/{bookingId}/accept";
	private static final String DECLINE = "/api/venues/{venueId}/booking-requests/{bookingId}/decline";
	private static final String ACCEPT_STAY = "/api/venues/{venueId}/booking-requests/stays/{stayId}/accept";
	private static final String DECLINE_STAY = "/api/venues/{venueId}/booking-requests/stays/{stayId}/decline";
	private static final long VENUE = 12L;
	private static final long BOOKING = 77L;

	/** Mirrors {@code RequestProblemDetails.NOT_PENDING}, which production shares across all three. */
	private static final String NOT_PENDING_DETAIL = "This booking is not awaiting a venue response.";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	RespondToRequest respondToRequest;

	@MockitoBean
	PendingRequests pendingRequests;

	@Test
	void aStayAcceptAnswersTheStayAndItsStatus() throws Exception {
		when(respondToRequest.acceptStay(any(), any(), any()))
				.thenReturn(new AcceptOutcome.Accepted(BookingStatus.AWAITING_PAYMENT));

		mvc.perform(post(ACCEPT_STAY, VENUE, 40L).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.stayId").value(40))
				.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"));
	}

	@Test
	void aStayAcceptThatLostADaySaysTheGuestWasTold() throws Exception {
		when(respondToRequest.acceptStay(any(), any(), any())).thenReturn(AcceptOutcome.Rejected.SET_UNAVAILABLE);

		mvc.perform(post(ACCEPT_STAY, VENUE, 40L).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SET_UNAVAILABLE"));
	}

	@Test
	void aStayDeclineAnswersTheStayDeclinedAndARepeatIsAConflict() throws Exception {
		when(respondToRequest.declineStay(any(), any(), any())).thenReturn(new DeclineOutcome.Declined(),
				DeclineOutcome.Rejected.NOT_PENDING);

		mvc.perform(post(DECLINE_STAY, VENUE, 40L).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.stayId").value(40))
				.andExpect(jsonPath("$.status").value("DECLINED"));
		mvc.perform(post(DECLINE_STAY, VENUE, 40L).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));
	}

	@Test
	void theQueueTagsEachItemByKindAndListsAStaysStops() throws Exception {
		Instant at = Instant.parse("2026-08-01T08:00:00Z");
		when(pendingRequests.forVenue(any(), any())).thenReturn(List.of(
				new PendingRequest.Lone(BOOKING, new SetId(11), LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 10),
						"Ana Doe", 4500L, "EUR", at, at.plusSeconds(3600), 1),
				new PendingRequest.Stay(new StayId(40), "Bo Doe", List.of(
						new PendingRequest.Stop(new SetId(11), LocalDate.of(2026, 8, 10), LocalDate.of(2026, 8, 11), 9000L, 1),
						new PendingRequest.Stop(new SetId(12), LocalDate.of(2026, 8, 12), LocalDate.of(2026, 8, 12), 4500L, 0)),
						"EUR", at, at.plusSeconds(3600), 1)));

		mvc.perform(get("/api/venues/{venueId}/booking-requests", VENUE).with(user("op").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].kind").value("BOOKING"))
				.andExpect(jsonPath("$[0].bookingId").value(BOOKING))
				.andExpect(jsonPath("$[1].kind").value("STAY"))
				.andExpect(jsonPath("$[1].stayId").value(40))
				.andExpect(jsonPath("$[1].firstDate").value("2026-08-10"))
				.andExpect(jsonPath("$[1].lastDate").value("2026-08-12"))
				.andExpect(jsonPath("$[1].total.minorUnits").value(13500))
				.andExpect(jsonPath("$[1].competingRequests").value(1))
				.andExpect(jsonPath("$[1].stops.length()").value(2))
				.andExpect(jsonPath("$[1].stops[1].setId").value(12))
				.andExpect(jsonPath("$[1].stops[1].amount.minorUnits").value(4500))
				.andExpect(jsonPath("$[1].code").doesNotExist());
	}

	@Test
	void acceptOfAWithdrawnRequestStatesTheConditionNotADecision() throws Exception {
		when(respondToRequest.accept(any(), any(), any())).thenReturn(AcceptOutcome.Rejected.NOT_PENDING);

		mvc.perform(post(ACCEPT, VENUE, BOOKING).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));
	}

	@Test
	void declineOfARequestThatLeftPendingCarriesTheSameDetailAsAccept() throws Exception {
		when(respondToRequest.decline(any(), any(), any())).thenReturn(DeclineOutcome.Rejected.NOT_PENDING);

		mvc.perform(post(DECLINE, VENUE, BOOKING).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("REQUEST_NOT_PENDING"))
				.andExpect(jsonPath("$.detail").value(NOT_PENDING_DETAIL));
	}

	@Test
	void aLostClaimAnswersSetUnavailableAndSaysTheGuestWasTold() throws Exception {
		when(respondToRequest.accept(any(), any(), any())).thenReturn(AcceptOutcome.Rejected.SET_UNAVAILABLE);

		mvc.perform(post(ACCEPT, VENUE, BOOKING).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isConflict())
				.andExpect(jsonPath("$.code").value("SET_UNAVAILABLE"))
				.andExpect(jsonPath("$.detail").value(
						"That set is no longer free for these days; the request was declined and the guest told."));
	}

	@Test
	void paymentInitFailureStatesTheCondition() throws Exception {
		when(respondToRequest.accept(any(), any(), any()))
				.thenReturn(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED);

		mvc.perform(post(ACCEPT, VENUE, BOOKING).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isBadGateway())
				.andExpect(jsonPath("$.code").value("PAYMENT_INIT_FAILED"))
				.andExpect(jsonPath("$.detail").value("The payment request could not be issued."));
	}
}
