package ai.riviera.platform.notification.adapter.out;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

/**
 * {@link EmailSuppressions} over the V33 {@code email_suppression} table (#382, hashed shape
 * #388/ADR-0012). Callers keep passing raw addresses; this adapter normalizes (trim + lower-case,
 * the {@code customer} module's canonical form) and then keys the row on {@code v1:} + lower-hex
 * HMAC-SHA-256(pepper, normalized) on <em>both</em> read and write — so no cleartext address ever
 * reaches the table, lookups hit the {@code UNIQUE (email_key)} index regardless of the caller's
 * casing, and the future #370 bounce feed inherits normalization + hashing for free. The cleartext
 * {@code domain} (the part after the last {@code '@'}, or {@code ''} for a non-address input —
 * never a local part) is stored for provider-level triage. The pepper is a long-lived env-managed
 * secret ({@code riviera.notification.suppression-pepper}; {@code SuppressionPepperProdGuard}
 * enforces a real one in prod) — rotating it orphans every stored row, the accepted ADR-0012
 * consequence. Repeat suppression is an {@code ON CONFLICT} upsert refreshing reason +
 * {@code last_event_at} while keeping {@code first_suppressed_at}. Package-private driven adapter
 * (invariant #11).
 */
@Component
class JdbcEmailSuppressions implements EmailSuppressions {

	private static final String KEY_SCHEME_PREFIX = "v1:";
	private static final String HMAC_ALGORITHM = "HmacSHA256";

	private final JdbcClient jdbc;
	private final SecretKeySpec pepperKey;

	JdbcEmailSuppressions(JdbcClient jdbc,
			@Value("${riviera.notification.suppression-pepper}") String pepper) {
		if (pepper.isBlank()) {
			throw new IllegalStateException(
					"riviera.notification.suppression-pepper must not be blank (set RIVIERA_SUPPRESSION_PEPPER)");
		}
		this.jdbc = jdbc;
		this.pepperKey = new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
	}

	@Override
	public boolean isSuppressed(String email) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM email_suppression WHERE email_key = :key)
				""")
				.param("key", keyOf(normalize(email)))
				.query(Boolean.class)
				.single();
	}

	@Override
	public void suppress(String email, SuppressionReason reason, Instant at) {
		String normalized = normalize(email);
		jdbc.sql("""
				INSERT INTO email_suppression (email_key, domain, reason, first_suppressed_at, last_event_at)
				VALUES (:key, :domain, :reason, :at, :at)
				ON CONFLICT (email_key) DO UPDATE
				SET reason = EXCLUDED.reason, last_event_at = EXCLUDED.last_event_at
				""")
				.param("key", keyOf(normalized))
				.param("domain", domainOf(normalized))
				.param("reason", reason.name())
				.param("at", java.sql.Timestamp.from(at))
				.update();
	}

	private String keyOf(String normalized) {
		try {
			Mac mac = Mac.getInstance(HMAC_ALGORITHM);
			mac.init(pepperKey);
			return KEY_SCHEME_PREFIX
					+ HexFormat.of().formatHex(mac.doFinal(normalized.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException | InvalidKeyException e) {
			throw new IllegalStateException("HMAC-SHA-256 unavailable for the suppression key", e);
		}
	}

	private static String domainOf(String normalized) {
		int at = normalized.lastIndexOf('@');
		return at >= 0 ? normalized.substring(at + 1) : "";
	}

	private static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
