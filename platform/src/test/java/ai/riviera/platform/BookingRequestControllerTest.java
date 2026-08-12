package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.booking.application.request.AcceptOutcome;
import ai.riviera.platform.booking.application.request.DeclineOutcome;
import ai.riviera.platform.booking.application.request.RespondToRequest;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-slice cover for the two request-queue rejections whose {@code detail} no HTTP-level test
 * reached: {@code PAYMENT_INIT_FAILED}, which only had a service test on the outcome enum, and the
 * {@code REQUEST_NOT_PENDING} wording shared with the guest withdraw in {@code BookingController}.
 *
 * <p>The accept and decline arms answer one string because one code describes one condition — and
 * that condition is "no longer pending", which a withdrawal reaches without anyone deciding
 * anything ({@code WithdrawRequestIT.acceptAfterWithdrawIsNotPending} provokes exactly that).
 */
@WebMvcTest
@Import({SecurityConfig.class, WebCorsConfig.class, WebSliceStubs.class})
class BookingRequestControllerTest {

	private static final String ACCEPT = "/api/venues/{venueId}/booking-requests/{bookingId}/accept";
	private static final String DECLINE = "/api/venues/{venueId}/booking-requests/{bookingId}/decline";
	private static final long VENUE = 12L;
	private static final long BOOKING = 77L;

	/** Shared with the withdraw leg; that all three call sites agree is the point of one constant. */
	private static final String NOT_PENDING_DETAIL = "This request is no longer waiting for the venue.";

	@Autowired
	MockMvc mvc;

	@MockitoBean
	RespondToRequest respondToRequest;

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
	void paymentInitFailureStatesTheCondition() throws Exception {
		when(respondToRequest.accept(any(), any(), any()))
				.thenReturn(AcceptOutcome.Rejected.PAYMENT_INIT_FAILED);

		mvc.perform(post(ACCEPT, VENUE, BOOKING).with(csrf()).with(user("op").roles("OPERATOR")))
				.andExpect(status().isBadGateway())
				.andExpect(jsonPath("$.code").value("PAYMENT_INIT_FAILED"))
				.andExpect(jsonPath("$.detail").value("The payment request could not be issued."));
	}
}
