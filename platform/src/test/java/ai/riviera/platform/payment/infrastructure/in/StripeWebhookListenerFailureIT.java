package ai.riviera.platform.payment.infrastructure.in;

import java.time.Duration;

import com.stripe.Stripe;
import com.stripe.net.Webhook;

import org.awaitility.Awaitility;
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
 * Proves the durability the async {@code @ApplicationModuleListener} buys (PR #53 review). The
 * webhook commits and acks Stripe ({@code 200}) <em>before</em> the listener runs, so reliability no
 * longer rests on the webhook transaction rolling back — it rests on the <strong>Event Publication
 * Registry</strong>. When {@code confirmFromPayment} throws on the async thread, the publication is
 * <strong>not</strong> lost: it stays in {@code event_publication} with a null
 * {@code completion_date}, retained for re-submission (on restart, per
 * {@code republish-outstanding-events-on-restart}). This is exactly the "what if it fails to confirm"
 * concern, now designed out by the registry rather than by the implicit rollback chain.
 *
 * <p>The {@code booking} {@link Bookings} port is mocked to throw; Testcontainers backs the registry
 * + payment tables. Skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "stripe.webhook-secret=whsec_test_u4_secret")
class StripeWebhookListenerFailureIT {

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

	private long incompletePublications() {
		return jdbc.sql("""
				SELECT COUNT(*) FROM event_publication
				WHERE event_type LIKE '%PaymentConfirmed' AND completion_date IS NULL
				""").query(Long.class).single();
	}

	@Test
	void failedListenerLeavesIncompletePublicationForResubmission() throws Exception {
		when(bookings.confirmFromPayment(anyLong(), any()))
				.thenThrow(new IllegalStateException("simulated failure on the async confirm"));
		payments.record(new NewPayment(new BookingRef(8001L), "pi_listener_fail", 4500L, "EUR"));
		String payload = eventJson("evt_listener_fail", "payment_intent.succeeded", "pi_listener_fail");

		// The webhook itself succeeds and acks Stripe — confirmation is now decoupled.
		mvc.perform(post("/api/payments/stripe/webhook")
						.header("Stripe-Signature", sign(payload))
						.content(payload))
				.andExpect(status().isOk());
		assertEquals("SUCCEEDED",
				jdbc.sql("SELECT status FROM payment WHERE payment_intent_id = 'pi_listener_fail'")
						.query(String.class).single(),
				"the webhook transaction committed (payment recorded SUCCEEDED)");

		// The failed async confirm leaves the publication incomplete — retained, not lost.
		Awaitility.await().atMost(Duration.ofSeconds(15))
				.until(() -> incompletePublications() >= 1);
	}
}
