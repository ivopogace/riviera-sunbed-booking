package ai.riviera.platform.notification.adapter.in;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Optional;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import ai.riviera.platform.notification.application.SuppressionReason;

/**
 * A TEM delivery event, the JSON inside a verified SNS {@code Message}: only the fields hygiene needs. Hard
 * bounces ({@code email_dropped}, {@code email_mailbox_not_found}) and spam reports ({@code email_spam}, TEM's
 * only complaint signal) suppress; every other type, the soft {@code email_deferred} included, does not.
 */
record TemDeliveryEvent(String type, String emailTo, Optional<Instant> createdAt) {

	static final String EMAIL_DROPPED = "email_dropped";
	static final String EMAIL_MAILBOX_NOT_FOUND = "email_mailbox_not_found";
	static final String EMAIL_SPAM = "email_spam";

	/** The event, or empty when {@code message} is not a JSON object with a {@code type}. */
	static Optional<TemDeliveryEvent> parse(String message, ObjectMapper json) {
		JsonNode root;
		try {
			root = json.readTree(message);
		}
		catch (JacksonException e) {
			return Optional.empty();
		}
		if (root == null || !root.isObject() || text(root, "type") == null) {
			return Optional.empty();
		}
		return Optional.of(new TemDeliveryEvent(text(root, "type"), text(root, "email_to"),
				instant(text(root, "created_at"))));
	}

	Optional<SuppressionReason> suppressionReason() {
		return switch (type) {
			case EMAIL_DROPPED, EMAIL_MAILBOX_NOT_FOUND -> Optional.of(SuppressionReason.HARD_BOUNCE);
			case EMAIL_SPAM -> Optional.of(SuppressionReason.COMPLAINT);
			default -> Optional.empty();
		};
	}

	private static Optional<Instant> instant(String rfc3339) {
		if (rfc3339 == null) {
			return Optional.empty();
		}
		try {
			return Optional.of(OffsetDateTime.parse(rfc3339).toInstant());
		}
		catch (DateTimeParseException e) {
			return Optional.empty();
		}
	}

	private static String text(JsonNode root, String field) {
		JsonNode value = root.get(field);
		return value != null && value.isString() ? value.asString() : null;
	}
}
