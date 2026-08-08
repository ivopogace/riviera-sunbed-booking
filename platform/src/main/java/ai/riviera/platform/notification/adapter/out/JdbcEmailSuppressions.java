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
 * {@link EmailSuppressions} over the {@code email_suppression} table (hashed shape, ADR-0012). Callers
 * keep passing raw addresses; this adapter normalizes through {@link Emails#normalize} — the
 * platform's one canonical form, shared with {@code customer} rather than re-implemented here, because
 * normalization is this key's <em>input contract</em>: a divergent copy would hash to a key that never
 * matches at send time, silently defeating the module's defining invariant with no error anywhere. It
 * then keys the row on {@code v1:} + lower-hex HMAC-SHA-256(pepper, normalized) on <em>both</em> read
 * and write, so no cleartext address reaches the table and lookups hit the {@code UNIQUE (email_key)}
 * index regardless of the caller's casing.
 *
 * <p>The cleartext {@code domain} (after the last {@code '@'}, never a local part) is stored for
 * provider-level triage; a write with no {@code '@'} or an empty local part is rejected loudly,
 * because rows are never deleted and a junk write would otherwise persist forever and mask the
 * caller's bug. The pepper is a long-lived env-managed secret
 * ({@code riviera.notification.suppression-pepper}, with {@code SuppressionPepperProdGuard} enforcing
 * a real one in prod) — <strong>rotating it orphans every stored row</strong>, the accepted ADR-0012
 * consequence. Package-private driven adapter (invariant #11).
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
	 * A {@link JdbcClient} of this adapter's own, with a finite {@code queryTimeout}. Postgres's default
	 * statement timeout is infinite, so one wedged read — a lock wait, a pathological plan — has no
	 * natural end.
	 *
	 * <p><strong>Three callers, with different stakes, and the count is load-bearing: wiring a new one
	 * means editing this paragraph</strong>, because "different stakes" is the whole argument for the
	 * value. On the recovery vehicle {@code isSuppressed} runs on {@code AsyncMailDispatcher}'s
	 * <strong>single</strong> drainer thread behind a 100-slot queue, where a wedged read stalls the mail
	 * queue and then silently drops every new send once the buffer fills. It is also reached from
	 * {@code SuppressedConfirmationMailDelivery} and {@code MailDeliverabilityService}, both on
	 * <strong>request</strong> threads, so the same bound is the ceiling on a user-facing response. That
	 * is why the default is <strong>2 s</strong> rather than the 5 s a mail queue alone would tolerate:
	 * both request-thread callers degrade to "no notice" on timeout, so a shorter bound costs an advisory
	 * line and saves the page carrying the guest's booking code. The mail path is unharmed — a timeout
	 * there fails open (recovery) or propagates for retry (registry).
	 *
	 * <p>Note what this does <em>not</em> bound: {@code queryTimeout} limits execution on a connection
	 * already acquired, so a genuinely exhausted pool is governed by the pool's own acquisition timeout.
	 *
	 * <p><strong>Scoped here on purpose, never set globally.</strong>
	 * {@code spring.jdbc.template.query-timeout} would bound <em>every</em> statement in the application
	 * — including {@code availability}'s {@code INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING}
	 * claim, the serialization point of invariant #2, whose loser waits on the winner's index tuple lock
	 * until it commits. Under set contention that legitimate wait could abort as a timeout rather than
	 * serialize, turning the platform's single most important correctness guarantee into a flaky one to
	 * fix a mail-queue concern. A dedicated client keeps the blast radius at this one lookup.
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
	 * The upsert, which also <strong>clears {@code reinstated_at}</strong> — that is the whole
	 * re-suppression path: a bounce after a reinstatement needs no new code, only the flag reset, and
	 * {@code first_suppressed_at} survives the cycle (the point of a flag over a {@code DELETE}).
	 *
	 * <p><strong>Obligation for the bounce-feed slice.</strong> Guard this {@code DO UPDATE} with
	 * {@code WHERE excluded.last_event_at >= email_suppression.last_event_at}, so an at-least-once feed
	 * replaying a delayed <em>older</em> event cannot downgrade {@code reason} or rewind
	 * {@code last_event_at}. Whoever adds it must keep the {@code reinstated_at = NULL} clear reachable:
	 * under a naive guard a stale event would skip the clear and leave a bounced address deliverable —
	 * the module's defining invariant, silently inverted.
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
	 * Lift a suppression and report what was there, behind an explicit row lock.
	 *
	 * <p>{@code SELECT … FOR UPDATE} first, then a conditional {@code UPDATE} in the same transaction —
	 * the {@code JdbcAvailabilityClaim} shape. The lock is what makes the three outcomes trustworthy
	 * under concurrency: no row → {@link ReinstateOutcome.NotSuppressed} (and nothing is written); a row
	 * already carrying {@code reinstated_at} → {@link ReinstateOutcome.AlreadyReinstated} with the
	 * <em>original</em> instant, so repeats are idempotent; otherwise the lift happens.
	 *
	 * <p><strong>Do not collapse this back into a single data-modifying CTE.</strong> That shape assumed
	 * the CTE's {@code UPDATE} and the outer {@code SELECT} share one snapshot. They do — but only while
	 * nobody else touches the row. Under READ COMMITTED an {@code UPDATE} that blocks on a concurrent
	 * writer re-checks its own {@code WHERE} against the <em>newest committed</em> version (EvalPlanQual)
	 * while the outer {@code SELECT} keeps the original snapshot, so two simultaneous reinstates of one
	 * address produced a row the code called unreachable and the mapper dereferenced a null
	 * {@code Timestamp}. {@code FOR UPDATE} has the property the CTE was assumed to have: the waiting
	 * reader re-fetches the committed row, so it observes the lift that actually won.
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
