package ai.riviera.platform.notification.adapter.out;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

/**
 * {@link EmailSuppressions} over the V33 {@code email_suppression} table (#382, hashed shape
 * #388/ADR-0012). Callers keep passing raw addresses; this adapter normalizes through
 * {@link Emails#normalize} — the platform's one canonical form, shared with {@code customer} rather
 * than re-implemented here (#386), because normalization is this key's <em>input contract</em>: a
 * divergent copy would hash to a key that never matches at send time, silently defeating the
 * module's defining invariant with no error anywhere — and then keys the row on {@code v1:} + lower-hex
 * HMAC-SHA-256(pepper, normalized) on <em>both</em> read and write — so no cleartext address ever
 * reaches the table, lookups hit the {@code UNIQUE (email_key)} index regardless of the caller's
 * casing, and the future #370 bounce feed inherits normalization + hashing for free. The cleartext
 * {@code domain} (the part after the last {@code '@'} — never a local part) is stored for
 * provider-level triage; a write with no {@code '@'} (or an empty local part) is rejected loudly —
 * rows are never deleted, so a junk write would otherwise persist forever and mask the caller's
 * bug. The pepper is a long-lived env-managed
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

	/** Generous for a single indexed-key lookup, short enough that a wedged read cannot stall the queue. */
	private static final String DEFAULT_QUERY_TIMEOUT_SECONDS = "5";

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
	 * A {@link JdbcClient} of this adapter's own, with a finite {@code queryTimeout} (#386).
	 *
	 * <p>{@code isSuppressed} runs on {@code AsyncMailDispatcher}'s <strong>single</strong> drainer
	 * thread, behind a 100-slot queue. Postgres's default statement timeout is infinite, so one wedged
	 * read — a lock wait, a pathological plan — stalls the whole recovery-mail queue and then silently
	 * drops every new send once the buffer fills. #368 gave the SMTP round-trip finite timeouts for
	 * exactly this reason; this closes the other half, the half that arrived later with the
	 * suppression check.
	 *
	 * <p>Note what this does <em>not</em> bound: {@code queryTimeout} limits execution on a connection
	 * already acquired, so a genuinely exhausted pool is still governed by the pool's own acquisition
	 * timeout, not by this.
	 *
	 * <p><strong>Scoped here on purpose, not set globally.</strong> The obvious instrument,
	 * {@code spring.jdbc.template.query-timeout}, bounds <em>every</em> statement in the application —
	 * including {@code availability}'s {@code SELECT … FOR UPDATE}, the serialization point of
	 * invariant #2. Under set contention a legitimate lock wait could then abort as a timeout rather
	 * than serialize, turning the platform's single most important correctness guarantee into a flaky
	 * one to fix a mail-queue concern. A dedicated client keeps the blast radius at this one lookup.
	 */
	private static JdbcClient boundedClient(DataSource dataSource, int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		return JdbcClient.create(bounded);
	}

	@Override
	public boolean isSuppressed(String email) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM email_suppression WHERE email_key = :key)
				""")
				.param("key", keyOf(Emails.normalize(email)))
				.query(Boolean.class)
				.single();
	}

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
				SET reason = EXCLUDED.reason, last_event_at = EXCLUDED.last_event_at
				""")
				.param("key", keyOf(normalized))
				.param("domain", domain)
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
}
