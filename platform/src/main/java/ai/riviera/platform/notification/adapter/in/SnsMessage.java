package ai.riviera.platform.notification.adapter.in;

import java.util.List;
import java.util.Optional;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * A Scaleway Topics &amp; Events (SNS-compatible) message as posted to a subscribed HTTPS endpoint. Nothing in
 * it is trusted until {@link SnsMessageVerifier} accepts it. {@link #stringToSign} is AWS SNS's signature
 * version 1 canonical form, which Scaleway adopts: each present field as {@code name\nvalue\n}, in key order.
 */
record SnsMessage(String type, String messageId, String topicArn, String subject, String message,
		String timestamp, String token, String subscribeUrl, String signatureVersion, String signature,
		String signingCertUrl) {

	static final String NOTIFICATION = "Notification";
	static final String SUBSCRIPTION_CONFIRMATION = "SubscriptionConfirmation";

	private static final List<String> NOTIFICATION_KEYS =
			List.of("Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type");
	private static final List<String> SUBSCRIPTION_KEYS =
			List.of("Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type");

	/** The envelope, or empty when the body is not a JSON object carrying every field a signature covers. */
	static Optional<SnsMessage> parse(byte[] body, ObjectMapper json) {
		JsonNode root;
		try {
			root = json.readTree(body);
		}
		catch (JacksonException e) {
			return Optional.empty();
		}
		if (root == null || !root.isObject()) {
			return Optional.empty();
		}
		SnsMessage parsed = new SnsMessage(text(root, "Type"), text(root, "MessageId"), text(root, "TopicArn"),
				text(root, "Subject"), text(root, "Message"), text(root, "Timestamp"), text(root, "Token"),
				text(root, "SubscribeURL"), text(root, "SignatureVersion"), text(root, "Signature"),
				text(root, "SigningCertURL"));
		return parsed.complete() ? Optional.of(parsed) : Optional.empty();
	}

	boolean isNotification() {
		return NOTIFICATION.equals(type);
	}

	boolean isSubscriptionConfirmation() {
		return SUBSCRIPTION_CONFIRMATION.equals(type);
	}

	String stringToSign() {
		StringBuilder canonical = new StringBuilder();
		for (String key : isNotification() ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS) {
			String value = valueOf(key);
			if (value != null) {
				canonical.append(key).append('\n').append(value).append('\n');
			}
		}
		return canonical.toString();
	}

	private boolean complete() {
		boolean envelope = messageId != null && topicArn != null && message != null && timestamp != null
				&& signatureVersion != null && signature != null && signingCertUrl != null;
		return envelope && (isNotification() || isSubscriptionConfirmation() && token != null && subscribeUrl != null);
	}

	private String valueOf(String key) {
		return switch (key) {
			case "Message" -> message;
			case "MessageId" -> messageId;
			case "Subject" -> subject;
			case "Timestamp" -> timestamp;
			case "TopicArn" -> topicArn;
			case "Type" -> type;
			case "Token" -> token;
			case "SubscribeURL" -> subscribeUrl;
			default -> throw new IllegalArgumentException("not a signed SNS field: " + key);
		};
	}

	private static String text(JsonNode root, String field) {
		JsonNode value = root.get(field);
		return value != null && value.isString() ? value.asString() : null;
	}
}
