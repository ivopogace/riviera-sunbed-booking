package ai.riviera.platform.payment.adapter.in;

import com.stripe.Stripe;
import com.stripe.net.Webhook;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.event.ApplicationEvents;
import org.springframework.test.context.event.RecordApplicationEvents;
import org.springframework.test.web.servlet.MockMvc;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.events.PaymentCanceled;
import ai.riviera.platform.payment.events.PaymentConfirmed;
import ai.riviera.platform.payment.application.NewPayment;
import ai.riviera.platform.payment.application.Payments;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * HTTP contract for the Stripe webhook (issue #8, AC-2..AC-6 / invariant #8). Posts
 * <strong>constructed, signed</strong> events through the real security filter chain — NO live
 * Stripe call. Proves: a verified {@code payment_intent.succeeded} confirms (marks the payment
 * SUCCEEDED + publishes {@link PaymentConfirmed}); a bad signature is rejected with no state
 * change; re-delivery is idempotent (deduped on event id); a {@code canceled} publishes
 * {@link PaymentCanceled}; unknown types are ignored. The booking-side confirm/release is proven
 * end-to-end in Phase 5. Testcontainers Postgres; skipped where Docker is absent.
 *
 * <p>No booking listener exists yet at this phase, so the published events have no consumer —
 * isolating the webhook→event mechanics. The booking-side transition has its own tests (Phase 5).
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
@RecordApplicationEvents
@TestPropertySource(properties = "stripe.webhook-secret=whsec_test_u4_secret")
class StripeWebhookIT {

	private static final String SECRET = "whsec_test_u4_secret";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Payments payments;

	@Autowired
	ApplicationEvents events;

	private String statusOf(String intentId) {
		return jdbc.sql("SELECT status FROM payment WHERE payment_intent_id = :i")
				.param("i", intentId).query(String.class).single();
	}

	private static String eventJson(String eventId, String type, String paymentIntentId) {
		return """
				{"id":"%s","object":"event","api_version":"%s","type":"%s",\
				"data":{"object":{"id":"%s","object":"payment_intent"}}}\
				""".formatted(eventId, Stripe.API_VERSION, type, paymentIntentId);
	}

	private static String sign(String payload) throws Exception {
		long timestamp = Webhook.Util.getTimeNow();
		String signed = timestamp + "." + payload;
		return "t=" + timestamp + ",v1=" + Webhook.Util.computeHmacSha256(SECRET, signed);
	}

	private void postSigned(String payload, String signature, int expectedStatus) throws Exception {
		mvc.perform(post("/api/payments/stripe/webhook")
						.header("Stripe-Signature", signature)
						.content(payload))
				.andExpect(status().is(expectedStatus));
	}

	@Test
	void verifiedSucceededConfirmsBooking() throws Exception {
		payments.register(new NewPayment(new BookingRef(7001L), "pi_hook_ok", 4500L, "EUR"));
		String payload = eventJson("evt_ok_1", "payment_intent.succeeded", "pi_hook_ok");

		postSigned(payload, sign(payload), 200);

		assertEquals("SUCCEEDED", statusOf("pi_hook_ok"), "verified success marks the payment SUCCEEDED");
		assertEquals(1, events.stream(PaymentConfirmed.class)
				.filter(e -> e.bookingRef().equals(new BookingRef(7001L))).count(),
				"a verified payment_intent.succeeded publishes exactly one PaymentConfirmed");
	}

	@Test
	void badSignatureRejectedNoConfirm() throws Exception {
		payments.register(new NewPayment(new BookingRef(7002L), "pi_hook_badsig", 4500L, "EUR"));
		String payload = eventJson("evt_badsig_1", "payment_intent.succeeded", "pi_hook_badsig");

		postSigned(payload, "t=1,v1=deadbeef", 400);

		assertEquals("REQUIRES_PAYMENT", statusOf("pi_hook_badsig"),
				"an unverified webhook never changes state (invariant #8)");
		assertEquals(0, events.stream(PaymentConfirmed.class)
				.filter(e -> e.bookingRef().equals(new BookingRef(7002L))).count(),
				"no confirmation event from an unverified webhook");
	}

	@Test
	void duplicateDeliveryIsIdempotent() throws Exception {
		payments.register(new NewPayment(new BookingRef(7003L), "pi_hook_dup", 4500L, "EUR"));
		String payload = eventJson("evt_dup_1", "payment_intent.succeeded", "pi_hook_dup");

		postSigned(payload, sign(payload), 200);
		postSigned(payload, sign(payload), 200); // re-delivery of the SAME event id

		assertEquals(1, events.stream(PaymentConfirmed.class)
				.filter(e -> e.bookingRef().equals(new BookingRef(7003L))).count(),
				"a re-delivered event id confirms only once (deduped, invariant #8)");
		long rows = jdbc.sql("SELECT COUNT(*) FROM stripe_webhook_event WHERE event_id = 'evt_dup_1'")
				.query(Long.class).single();
		assertEquals(1L, rows, "the event id is recorded exactly once");
	}

	@Test
	void outOfOrderIsSafe() throws Exception {
		// An unknown/unrelated event type must be accepted (200) and ignored — no state change.
		payments.register(new NewPayment(new BookingRef(7004L), "pi_hook_other", 4500L, "EUR"));
		String payload = eventJson("evt_other_1", "payment_intent.created", "pi_hook_other");

		postSigned(payload, sign(payload), 200);

		assertEquals("REQUIRES_PAYMENT", statusOf("pi_hook_other"),
				"an event type we don't act on leaves state unchanged");
		assertEquals(0, events.stream(PaymentConfirmed.class)
				.filter(e -> e.bookingRef().equals(new BookingRef(7004L))).count(),
				"no confirmation from an unrelated event");
	}

	@Test
	void canceledPublishesPaymentCanceled() throws Exception {
		payments.register(new NewPayment(new BookingRef(7005L), "pi_hook_cancel", 4500L, "EUR"));
		String payload = eventJson("evt_cancel_1", "payment_intent.canceled", "pi_hook_cancel");

		postSigned(payload, sign(payload), 200);

		assertEquals("CANCELED", statusOf("pi_hook_cancel"), "a canceled intent marks the payment CANCELED");
		assertEquals(1, events.stream(PaymentCanceled.class)
				.filter(e -> e.bookingRef().equals(new BookingRef(7005L))).count(),
				"a verified payment_intent.canceled publishes PaymentCanceled (claim release path)");
	}
}
