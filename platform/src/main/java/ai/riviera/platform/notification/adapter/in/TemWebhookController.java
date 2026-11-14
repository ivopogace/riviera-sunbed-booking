package ai.riviera.platform.notification.adapter.in;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.ObjectMapper;

import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;
import ai.riviera.platform.shared.ApiProblem;

/**
 * The TEM delivery-event feed, through Scaleway Topics &amp; Events (ADR-0011 decision 7): verify ({@code 400}
 * for anything unverifiable, nothing stored), then confirm a subscription or suppress a hard bounce or complaint
 * at the event's time. Replays are inert by the upsert's out-of-order guard. A verified but unreadable event
 * is consumed ({@code 204}); a database failure answers {@code 5xx} so SNS re-delivers. Never logs an address,
 * token or URL. Rationale: RESPONSIBILITIES.md §notification.
 */
@RestController
@RequestMapping("/api/notifications/tem")
class TemWebhookController {

	private static final Logger log = LoggerFactory.getLogger(TemWebhookController.class);

	private static final String CODE_INVALID_SIGNATURE = "INVALID_SIGNATURE";

	private final SnsMessageVerifier verifier;
	private final SnsEndpointPolicy policy;
	private final SubscriptionConfirmer confirmer;
	private final EmailSuppressions suppressions;
	private final ObjectMapper json;
	private final Clock clock;

	TemWebhookController(TemWebhookProperties properties, SigningCertificateSource certificates,
			SubscriptionConfirmer confirmer, EmailSuppressions suppressions, ObjectMapper json, Clock clock,
			ResourceLoader resources) {
		this.policy = properties.endpointPolicy();
		this.verifier = new SnsMessageVerifier(trustAnchors(properties.trustChain(), resources),
				properties.topicArn(), policy, certificates, clock);
		this.confirmer = confirmer;
		this.suppressions = suppressions;
		this.json = json;
		this.clock = clock;
		if (!verifier.isConfigured()) {
			log.info("TEM delivery-event feed not configured: every delivery is refused (runbook: mailer-profile)");
		}
	}

	@PostMapping("/webhook")
	ResponseEntity<?> handle(@RequestBody(required = false) byte[] body) {
		Optional<SnsMessage> parsed = body == null ? Optional.empty() : SnsMessage.parse(body, json);
		if (parsed.isEmpty() || !verifier.verify(parsed.get())) {
			return unverified();
		}
		SnsMessage message = parsed.get();
		if (message.isSubscriptionConfirmation()) {
			return confirm(message);
		}
		TemDeliveryEvent.parse(message.message(), json)
				.ifPresentOrElse(event -> ingest(event, message),
						() -> log.warn("verified SNS message {} carries no TEM event; consumed", message.messageId()));
		return ResponseEntity.noContent().build();
	}

	private ResponseEntity<?> confirm(SnsMessage message) {
		Optional<URI> subscribeUrl = policy.subscribeUri(message.subscribeUrl());
		if (subscribeUrl.isEmpty()) {
			log.warn("verified subscription confirmation names a host off riviera.notification.tem-webhook"
					+ ".subscribe-hosts; not confirmed");
			return ResponseEntity.noContent().build();
		}
		try {
			confirmer.confirm(subscribeUrl.get());
		}
		catch (IOException e) {
			log.warn("could not confirm the Topics & Events subscription ({}); SNS will re-send it",
					e.getClass().getSimpleName());
			return ApiProblem.response(HttpStatus.SERVICE_UNAVAILABLE, "SUBSCRIPTION_NOT_CONFIRMED",
					"The subscription could not be confirmed.");
		}
		log.info("confirmed the Topics & Events subscription for the TEM delivery-event feed");
		return ResponseEntity.noContent().build();
	}

	private void ingest(TemDeliveryEvent event, SnsMessage message) {
		Optional<SuppressionReason> reason = event.suppressionReason();
		if (reason.isEmpty()) {
			return;
		}
		if (event.emailTo() == null) {
			log.warn("verified TEM {} event {} names no recipient; consumed", event.type(), message.messageId());
			return;
		}
		Instant at = event.createdAt().or(() -> instant(message.timestamp())).orElseGet(clock::instant);
		try {
			suppressions.suppress(event.emailTo(), reason.get(), at);
		}
		catch (IllegalArgumentException e) {
			log.warn("verified TEM {} event {} names no email address; consumed", event.type(), message.messageId());
			return;
		}
		log.info("suppressed a recipient ({}) on a TEM {} event", reason.get(), event.type());
	}

	/**
	 * The {@code 400} for a body that is not a message, a missing or bad signature, a foreign topic or an
	 * unconfigured feed: one answer, so a forger learns nothing about which check failed.
	 */
	private static ResponseEntity<ProblemDetail> unverified() {
		return ApiProblem.response(HttpStatus.BAD_REQUEST, CODE_INVALID_SIGNATURE,
				"The webhook signature is missing or could not be verified.");
	}

	/** A configured chain that cannot be read fails the boot: a typo must not silently close the feed. */
	private static SnsTrustAnchors trustAnchors(String location, ResourceLoader resources) {
		if (location.isEmpty()) {
			return SnsTrustAnchors.none();
		}
		Resource chain = resources.getResource(location);
		try (InputStream in = chain.getInputStream()) {
			return SnsTrustAnchors.parse(in.readAllBytes());
		}
		catch (IOException e) {
			throw new UncheckedIOException(
					"riviera.notification.tem-webhook.trust-chain names an unreadable resource", e);
		}
	}

	private static Optional<Instant> instant(String rfc3339) {
		try {
			return Optional.of(OffsetDateTime.parse(rfc3339).toInstant());
		}
		catch (DateTimeParseException e) {
			return Optional.empty();
		}
	}
}
