package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.TransactionalMailService;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The TEM delivery-event feed end to end (#372): a Topics &amp; Events message signed by a test CA the
 * deployment trusts, posted through the real filter chain (no CSRF token, no session), lands in the real
 * suppression table, and the chokepoint then withholds mail. Certificates and the confirmation GET are
 * served in-JVM, so nothing leaves the test. Rows are never deleted: each test owns a unique domain.
 */
@EnabledIfDockerAvailable
@Import({TestcontainersConfiguration.class, TemWebhookIT.ServedByScaleway.class})
@SpringBootTest
@AutoConfigureMockMvc
class TemWebhookIT {

	private static final SnsTestPki PKI = SnsTestPki.get();
	private static final String ENDPOINT = "/api/notifications/tem/webhook";
	private static final String SUBSCRIBE_URL =
			"https://sns.mnq.fr-par.scaleway.com/?Action=ConfirmSubscription&TopicArn=arn&Token=t";

	@DynamicPropertySource
	static void trustTheTestCa(DynamicPropertyRegistry registry) {
		registry.add("riviera.notification.tem-webhook.topic-arn", () -> SnsTestPki.TOPIC_ARN);
		registry.add("riviera.notification.tem-webhook.trust-chain", () -> PKI.caPemFile().toUri().toString());
	}

	/** Scaleway's two endpoints, in-JVM: the cert URLs serve the test PKI; confirmations are recorded. */
	@TestConfiguration(proxyBeanMethods = false)
	static class ServedByScaleway {

		static final List<URI> CONFIRMED = new CopyOnWriteArrayList<>();

		@Bean
		@Primary
		SigningCertificateSource servedCertificates() {
			return uri -> {
				byte[] served = PKI.servedCertificates().get(uri.toString());
				if (served == null) {
					throw new IOException("404");
				}
				return served;
			};
		}

		@Bean
		@Primary
		SubscriptionConfirmer recordedConfirmations() {
			return CONFIRMED::add;
		}
	}

	@Autowired
	MockMvc mvc;

	@Autowired
	EmailSuppressions suppressions;

	@Autowired
	TransactionalMailService mailService;

	@Autowired
	MockMailer mailer;

	@Autowired
	JdbcClient jdbc;

	@BeforeEach
	void forgetConfirmations() {
		ServedByScaleway.CONFIRMED.clear();
	}

	@Test
	void aVerifiedHardBounceSuppressesTheRecipient() throws Exception {
		deliver(PKI.notification(event("email_dropped", "gone@tem-dropped.example.com")))
				.andExpect(status().isNoContent());

		assertThat(suppressions.isSuppressed("gone@tem-dropped.example.com")).isTrue();
		assertThat(reasonFor("tem-dropped.example.com")).isEqualTo("HARD_BOUNCE");
		assertThat(lastEventAt("tem-dropped.example.com"))
				.as("the event's own time, which the out-of-order guard compares")
				.isEqualTo(Instant.parse("2026-11-14T08:59:00Z"));
	}

	@Test
	void aMailboxNotFoundIsAHardBounce() throws Exception {
		deliver(PKI.notification(event("email_mailbox_not_found", "nobody@tem-nobox.example.com")))
				.andExpect(status().isNoContent());

		assertThat(reasonFor("tem-nobox.example.com")).isEqualTo("HARD_BOUNCE");
	}

	@Test
	void aSpamReportSuppressesAsAComplaint() throws Exception {
		deliver(PKI.notification(event("email_spam", "annoyed@tem-spam.example.com")))
				.andExpect(status().isNoContent());

		assertThat(reasonFor("tem-spam.example.com")).isEqualTo("COMPLAINT");
	}

	@Test
	void aSoftBounceOrADeliveryStoresNothing() throws Exception {
		deliver(PKI.notification(event("email_deferred", "full@tem-soft.example.com")))
				.andExpect(status().isNoContent());
		deliver(PKI.notification(event("email_delivered", "fine@tem-soft.example.com")))
				.andExpect(status().isNoContent());

		assertThat(rowsFor("tem-soft.example.com")).isZero();
	}

	@Test
	void aBouncedAddressIsNotMailedAgain() throws Exception {
		String email = "bounced@tem-skip.example.com";
		deliver(PKI.notification(event("email_dropped", email))).andExpect(status().isNoContent());

		mailService.sendBookingConfirmation(email, confirmation());

		assertThat(mailer.lastTo(email)).as("skipped silently at the chokepoint, no caller-visible error").isEmpty();
	}

	@Test
	void aReplayedNotificationIsInert() throws Exception {
		String body = PKI.notification(event("email_dropped", "twice@tem-replay.example.com"));

		deliver(body).andExpect(status().isNoContent());
		deliver(body).andExpect(status().isNoContent());

		assertThat(rowsFor("tem-replay.example.com")).isOne();
	}

	@Test
	void aReplayAfterAReinstatementKeepsTheLift() throws Exception {
		String email = "lifted@tem-lifted.example.com";
		String body = PKI.notification(event("email_dropped", email));
		deliver(body).andExpect(status().isNoContent());
		suppressions.reinstate(email, Instant.parse("2026-11-14T10:00:00Z"));

		deliver(body).andExpect(status().isNoContent());

		assertThat(suppressions.isSuppressed(email)).isFalse();
	}

	@Test
	void anUnsignedMessageIsRefusedAndStoresNothing() throws Exception {
		Map<String, String> fields = PKI.notificationFields(event("email_dropped", "x@tem-unsigned.example.com"));

		refused(deliver(SnsTestPki.json(fields)));
		assertThat(rowsFor("tem-unsigned.example.com")).isZero();
	}

	@Test
	void aMessageAlteredAfterSigningIsRefused() throws Exception {
		String body = PKI.notification(event("email_dropped", "real@tem-altered.example.com"))
				.replace("real@tem-altered", "victim@tem-altered");

		refused(deliver(body));
		assertThat(rowsFor("tem-altered.example.com")).isZero();
	}

	@Test
	void aMessageSignedByAnUntrustedCertIsRefused() throws Exception {
		refused(deliver(PKI.signedByRogue(PKI.notificationFields(event("email_spam", "x@tem-rogue.example.com")))));
		assertThat(rowsFor("tem-rogue.example.com")).isZero();
	}

	@Test
	void aValidlySignedMessageFromAnotherTopicIsRefused() throws Exception {
		Map<String, String> fields = PKI.notificationFields(event("email_spam", "x@tem-foreign.example.com"));
		fields.put("TopicArn", "arn:scw:sns:fr-par:someone-else:their-topic");

		refused(deliver(PKI.signed(fields)));
		assertThat(rowsFor("tem-foreign.example.com")).isZero();
	}

	@Test
	void aBodyThatIsNotAnSnsMessageIsRefused() throws Exception {
		refused(deliver("{\"type\":\"email_dropped\",\"email_to\":\"x@tem-raw.example.com\"}"));
		refused(mvc.perform(post(ENDPOINT)));
		assertThat(rowsFor("tem-raw.example.com")).isZero();
	}

	@Test
	void aVerifiedButUnreadableEventIsConsumedNotRetried() throws Exception {
		deliver(PKI.notification("not a tem event")).andExpect(status().isNoContent());
		deliver(PKI.notification(event("email_dropped", "not-an-address"))).andExpect(status().isNoContent());
		deliver(PKI.notification("{\"type\":\"email_dropped\"}")).andExpect(status().isNoContent());
	}

	@Test
	void aVerifiedSubscriptionConfirmationIsConfirmed() throws Exception {
		deliver(PKI.signed(PKI.subscriptionFields(SUBSCRIBE_URL))).andExpect(status().isNoContent());

		assertThat(ServedByScaleway.CONFIRMED).containsExactly(URI.create(SUBSCRIBE_URL));
	}

	@Test
	void aSubscribeUrlOffTheAllowlistIsNeverFetched() throws Exception {
		deliver(PKI.signed(PKI.subscriptionFields("https://evil.example.com/?Action=ConfirmSubscription")))
				.andExpect(status().isNoContent());

		assertThat(ServedByScaleway.CONFIRMED).isEmpty();
	}

	@Test
	void anUnsignedSubscriptionConfirmationIsNeverFetched() throws Exception {
		refused(deliver(SnsTestPki.json(PKI.subscriptionFields(SUBSCRIBE_URL))));

		assertThat(ServedByScaleway.CONFIRMED).isEmpty();
	}

	/** SNS posts {@code text/plain} with no {@code Origin}; the route needs neither CSRF token nor session. */
	private ResultActions deliver(String body) throws Exception {
		return mvc.perform(post(ENDPOINT).contentType(MediaType.TEXT_PLAIN).content(body));
	}

	private static void refused(ResultActions result) throws Exception {
		result.andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_SIGNATURE"));
	}

	private static String event(String type, String emailTo) {
		return """
				{"id":"3f1c2a9e-5b7d-4e2f-9a61-8c0d1e2f3a4b","type":"%s","project_id":"p","domain_id":"d",\
				"created_at":"2026-11-14T08:59:00Z","email_id":"e","email_to":"%s"}""".formatted(type, emailTo);
	}

	private static BookingConfirmationMail confirmation() {
		return new BookingConfirmationMail("CODE1234", "Vala Beach", LocalDate.of(2026, 8, 1), "A", 3,
				4500, "EUR", CancellationWindow.FREE, 0);
	}

	private String reasonFor(String domain) {
		return jdbc.sql("SELECT reason FROM email_suppression WHERE domain = :domain")
				.param("domain", domain).query(String.class).single();
	}

	private Instant lastEventAt(String domain) {
		return jdbc.sql("SELECT last_event_at FROM email_suppression WHERE domain = :domain")
				.param("domain", domain).query((rs, n) -> rs.getTimestamp("last_event_at").toInstant()).single();
	}

	private long rowsFor(String domain) {
		return jdbc.sql("SELECT count(*) FROM email_suppression WHERE domain = :domain")
				.param("domain", domain).query(Long.class).single();
	}
}
