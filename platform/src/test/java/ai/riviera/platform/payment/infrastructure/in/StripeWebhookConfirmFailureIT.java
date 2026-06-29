package ai.riviera.platform.payment.infrastructure.in;

import com.stripe.Stripe;
import com.stripe.net.Webhook;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.application.out.Bookings;
import ai.riviera.platform.payment.api.BookingRef;
import ai.riviera.platform.payment.application.out.NewPayment;
import ai.riviera.platform.payment.application.out.Payments;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Proves the sync {@code @EventListener} confirmation path does <strong>not</strong> lose an event
 * on failure (PR #53 review). The webhook handler is one transaction and the listener runs inside
 * it, so when {@code confirmFromPayment} throws, the <em>entire</em> handler rolls back — including
 * the {@code stripe_webhook_event} dedup insert and the {@code markStatus(SUCCEEDED)} — and the
 * endpoint returns 5xx, so <strong>Stripe re-delivers</strong> (its ~72h auto-retry is the durable
 * log here, the role the Event Publication Registry would play for an internal publisher). On
 * re-delivery the rolled-back dedup row is absent, so the event reprocesses cleanly.
 *
 * <p>The {@code booking} {@link Bookings} port is mocked to throw; Testcontainers Postgres backs the
 * payment/webhook tables. Skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "stripe.webhook-secret=whsec_test_u4_secret")
class StripeWebhookConfirmFailureIT {

	private static final String SECRET = "whsec_test_u4_secret";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Payments payments;

	@MockitoBean
	Bookings bookings;

	private static String eventJson(String eventId, String type, String paymentIntentId) {
		return """
				{"id":"%s","object":"event","api_version":"%s","type":"%s",\
				"data":{"object":{"id":"%s","object":"payment_intent"}}}\
				""".formatted(eventId, Stripe.API_VERSION, type, paymentIntentId);
	}

	private static String sign(String payload) throws Exception {
		long timestamp = Webhook.Util.getTimeNow();
		return "t=" + timestamp + ",v1="
				+ Webhook.Util.computeHmacSha256(SECRET, timestamp + "." + payload);
	}

	@Test
	void confirmFailureRollsBackTheWholeWebhookTransaction() throws Exception {
		when(bookings.confirmFromPayment(anyLong(), any()))
				.thenThrow(new IllegalStateException("simulated DB failure during confirm"));
		payments.record(new NewPayment(new BookingRef(8001L), "pi_confirm_fail", 4500L, "EUR"));
		String payload = eventJson("evt_confirm_fail", "payment_intent.succeeded", "pi_confirm_fail");

		mvc.perform(post("/api/payments/stripe/webhook")
						.header("Stripe-Signature", sign(payload))
						.content(payload))
				.andExpect(status().is5xxServerError());

		// Nothing committed → the event is NOT lost; Stripe re-delivers and reprocesses cleanly.
		assertEquals("REQUIRES_PAYMENT",
				jdbc.sql("SELECT status FROM payment WHERE payment_intent_id = 'pi_confirm_fail'")
						.query(String.class).single(),
				"markStatus(SUCCEEDED) rolled back with the transaction");
		assertEquals(0L,
				jdbc.sql("SELECT COUNT(*) FROM stripe_webhook_event WHERE event_id = 'evt_confirm_fail'")
						.query(Long.class).single(),
				"the dedup insert rolled back, so a Stripe re-delivery reprocesses the event");
	}
}
