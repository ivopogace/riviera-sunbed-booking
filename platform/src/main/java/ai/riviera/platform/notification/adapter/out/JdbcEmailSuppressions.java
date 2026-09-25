package ai.riviera.platform.notification.adapter.out;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.ReinstateOutcome;
import ai.riviera.platform.notification.application.SuppressionReason;

/**
 * {@link EmailSuppressions} over the hashed {@code email_suppression} table (ADR-0012). Every read
 * and write normalizes through {@link Emails#normalize} (never a local copy: a divergent form hashes
 * to a key that silently never matches) and keys on {@code v1:} + hex HMAC-SHA-256(pepper, address),
 * so no cleartext address reaches the table; only the {@code domain} is stored. Non-addresses are
 * rejected loudly, as rows are never deleted. <strong>Rotating the pepper orphans every row.</strong>
 */
@Component
class JdbcEmailSuppressions implements EmailSuppressions {

	private static final String KEY_SCHEME_PREFIX = "v1:";
	private static final String HMAC_ALGORITHM = "HmacSHA256";

	/** Generous for a single indexed-key lookup, short enough that a wedged read cannot stall the queue. */
	// 2 s, not 5: this also bounds a user-facing read (see boundedClient).
	private static final String DEFAULT_QUERY_TIMEOUT_SECONDS = "2";

	private final JdbcClient jdbc;
	private final SecretKeySpec pepperKey;

	JdbcEmailSuppressions(DataSource dataSource,
			@Value("${riviera.notification.suppression-pepper:}") String pepper,
			@Value("${riviera.notification.suppression-query-timeout-seconds:"
					+ DEFAULT_QUERY_TIMEOUT_SECONDS + "}") int queryTimeoutSeconds) {
		if (pepper.isBlank()) {
			throw new IllegalStateException(
					"riviera.notification.suppression-pepper must not be blank (set RIVIERA_SUPPRESSION_PEPPER)");
		}
		this.jdbc = boundedClient(dataSource, queryTimeoutSeconds);
		this.pepperKey = new SecretKeySpec(pepper.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
	}

	/**
	 * This adapter's own finite {@code queryTimeout} (2 s, as request threads also wait on it), never
	 * the global property, which would also bound the invariant-#2 claim (ADR-0011). It does not bound
	 * pool acquisition.
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	@Override
	public boolean isSuppressed(String email) {
		return jdbc.sql("""
				SELECT EXISTS (
				  SELECT 1 FROM email_suppression WHERE email_key = :key AND reinstated_at IS NULL
				)
				""")
				.param("key", keyOf(Emails.normalize(email)))
				.query(Boolean.class)
				.single();
	}

	/**
	 * The upsert also clears {@code reinstated_at} (re-suppression). A future out-of-order guard on
	 * {@code last_event_at} must keep that clear reachable, or a stale event leaves a bounced address
	 * deliverable.
	 */
	@Override
	public void suppress(String email, SuppressionReason reason, Instant at) {
		String normalized = Emails.normalize(email);
		int atIndex = normalized.lastIndexOf('@');
		String domain = atIndex < 0 ? "" : normalized.substring(atIndex + 1);
		// normalize() trims the whole address, never the domain substring, so "user@ x.com" reaches here
		// with padding the V34 CHECK rejects — refuse it now, not as a DataIntegrityViolationException.
		if (atIndex < 1 || domain.isEmpty() || !domain.equals(domain.trim())) {
			// No address echoed (PII posture) — rows are never deleted, so junk must fail loudly here.
			throw new IllegalArgumentException(
					"suppress() requires an email address (local@domain); refusing to store a non-address");
		}
		jdbc.sql("""
				INSERT INTO email_suppression (email_key, domain, reason, first_suppressed_at, last_event_at)
				VALUES (:key, :domain, :reason, :at, :at)
				ON CONFLICT (email_key) DO UPDATE
				SET reason = EXCLUDED.reason,
				    last_event_at = EXCLUDED.last_event_at,
				    -- Must survive any future out-of-order guard (#367); see this method's javadoc.
				    reinstated_at = NULL
				""")
				.param("key", keyOf(normalized))
				.param("domain", domain)
				.param("reason", reason.name())
				.param("at", java.sql.Timestamp.from(at))
				.update();
	}

	/**
	 * {@code SELECT … FOR UPDATE} then a conditional {@code UPDATE}; do not collapse into one
	 * data-modifying CTE, whose {@code UPDATE} re-checks against a newer row than its outer
	 * {@code SELECT} sees under concurrent reinstates (EvalPlanQual).
	 */
	@Override
	@Transactional
	public ReinstateOutcome reinstate(String email, Instant at) {
		String key = keyOf(Emails.normalize(email));
		Optional<Suppression> locked = jdbc.sql("""
				SELECT reason, first_suppressed_at, last_event_at, reinstated_at
				FROM email_suppression
				WHERE email_key = :key
				FOR UPDATE
				""")
				.param("key", key)
				.query(JdbcEmailSuppressions::readSuppression)
				.optional();
		if (locked.isEmpty()) {
			return new ReinstateOutcome.NotSuppressed();
		}
		Suppression row = locked.get();
		if (row.reinstatedAt() != null) {
			return new ReinstateOutcome.AlreadyReinstated(row.reason(), row.firstSuppressedAt(),
					row.lastEventAt(), row.reinstatedAt());
		}
		jdbc.sql("UPDATE email_suppression SET reinstated_at = :at WHERE email_key = :key")
				.param("at", java.sql.Timestamp.from(at))
				.param("key", key)
				.update();
		return new ReinstateOutcome.Reinstated(row.reason(), row.firstSuppressedAt(), row.lastEventAt());
	}

	/** The locked row, as read. {@code reinstatedAt} is null while the suppression is active. */
	private record Suppression(SuppressionReason reason, Instant firstSuppressedAt, Instant lastEventAt,
			Instant reinstatedAt) {
	}

	private static Suppression readSuppression(ResultSet row, int rowNumber) throws SQLException {
		java.sql.Timestamp reinstatedAt = row.getTimestamp("reinstated_at");
		return new Suppression(SuppressionReason.valueOf(row.getString("reason")),
				row.getTimestamp("first_suppressed_at").toInstant(),
				row.getTimestamp("last_event_at").toInstant(),
				reinstatedAt == null ? null : reinstatedAt.toInstant());
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
}
