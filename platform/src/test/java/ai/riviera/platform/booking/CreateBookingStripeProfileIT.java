package ai.riviera.platform.booking;

import java.time.LocalDate;

import com.stripe.StripeClient;
import com.stripe.model.PaymentIntent;
import com.stripe.service.PaymentIntentService;
import com.stripe.service.V1Services;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.SessionLoginSupport;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The {@code stripe}-profile HTTP contract for {@code POST /api/bookings} (issue #8, AC-1): with
 * the Stripe gateway active, a successful create returns {@code 202 AWAITING_PAYMENT} and a
 * {@code clientSecret} — the booking is <strong>not</strong> confirmed synchronously; confirmation
 * comes only from the verified webhook (invariant #8). The {@link StripeClient} is mocked, so no
 * live Stripe call is made. Testcontainers Postgres; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("stripe")
@TestPropertySource(properties = {"stripe.api-key=sk_test_dummy", "stripe.webhook-secret=whsec_test"})
class CreateBookingStripeProfileIT {

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@MockitoBean
	StripeClient stripeClient;

	@BeforeEach
	void stubStripe() throws Exception {
		V1Services v1 = mock(V1Services.class);
		PaymentIntentService intents = mock(PaymentIntentService.class);
		PaymentIntent intent = mock(PaymentIntent.class);
		when(intent.getId()).thenReturn("pi_profile_it");
		when(intent.getClientSecret()).thenReturn("pi_profile_it_secret");
		when(stripeClient.v1()).thenReturn(v1);
		when(v1.paymentIntents()).thenReturn(intents);
		when(intents.create(any(), any())).thenReturn(intent);
	}

	private long onlineSet() {
		return jdbc.sql("SELECT id FROM set_position WHERE pool = 'ONLINE' ORDER BY id LIMIT 1")
				.query(Long.class).single();
	}

	private String body(long setId, LocalDate date) {
		return """
				{"setId": %d, "bookingDate": "%s",
				 "contact": {"email": "s@e.com", "fullName": "Stripe Guest", "phone": "+355699"}}
				""".formatted(setId, date);
	}

	@Test
	void stayCreateReturns202WithItsCheckoutInstruction() throws Exception {
		String intentId = "pi_stay_wire_" + System.nanoTime();
		PaymentIntent intent = mock(PaymentIntent.class);
		when(intent.getId()).thenReturn(intentId);
		when(intent.getClientSecret()).thenReturn(intentId + "_secret");
		when(stripeClient.v1().paymentIntents().create(any(), any())).thenReturn(intent);
		StayFixtures.Venue venue = StayFixtures.venue(jdbc, "INSTANT", null, true);
		try {
			LocalDate first = StayFixtures.firstDay();
			mvc.perform(post("/api/stays")
							.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
							.contentType(MediaType.APPLICATION_JSON)
							.content(stayBody(venue.online().get(0).value(), venue.online().get(1).value(), first)))
					.andExpect(status().isAccepted())
					.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
					.andExpect(jsonPath("$.payment.kind").value("EMBEDDED"))
					.andExpect(jsonPath("$.payment.clientToken").value(intentId + "_secret"))
					.andExpect(jsonPath("$.payment.reference").value(intentId));
		}
		finally {
			StayFixtures.cleanup(jdbc, venue.id());
		}
	}

	private static String stayBody(long a, long b, LocalDate first) {
		return """
				{"stretches":[{"setId":%d,"firstDate":"%s","lastDate":"%s"},{"setId":%d,"firstDate":"%s","lastDate":"%s"}],
				 "contact":{"email":"s@e.com","fullName":"Stripe Guest","phone":"+355699"}}
				""".formatted(a, first, first.plusDays(1), b, first.plusDays(2), first.plusDays(3));
	}

	@Test
	void createReturns202AwaitingPaymentWithItsCheckoutInstruction() throws Exception {
		LocalDate date = LocalDate.now().plusYears(1).plusDays(7);

		mvc.perform(post("/api/bookings")
						.header(SessionLoginSupport.CHALLENGE_HEADER, SessionLoginSupport.solvedChallenge(mvc))
						.contentType(MediaType.APPLICATION_JSON)
						.content(body(onlineSet(), date)))
				.andExpect(status().isAccepted())
				.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
				.andExpect(jsonPath("$.payment.kind").value("EMBEDDED"))
				.andExpect(jsonPath("$.payment.clientToken").value("pi_profile_it_secret"))
				.andExpect(jsonPath("$.payment.reference").value("pi_profile_it"))
				.andExpect(jsonPath("$.code").isNotEmpty())
				.andExpect(jsonPath("$.amount.currency").value("EUR"));

		String status = jdbc.sql("SELECT status FROM booking ORDER BY id DESC LIMIT 1")
				.query(String.class).single();
		assertEquals("AWAITING_PAYMENT", status,
				"the booking stays AWAITING_PAYMENT until the verified webhook (invariant #8)");
		long payments = jdbc.sql("SELECT COUNT(*) FROM payment WHERE payment_intent_id = 'pi_profile_it'")
				.query(Long.class).single();
		assertEquals(1L, payments, "the PaymentIntent record is persisted");
	}
}
