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
 * {@link EmailSuppressions} over the V33 {@code email_suppression} table (#382, hashed shape
 * #388/ADR-0012). Callers keep passing raw addresses; this adapter normalizes through
 * {@link Emails#normalize} — the platform's one canonical form, shared with {@code customer} rather
 * than re-implemented here (#386), because normalization is this key's <em>input contract</em>: a
 * divergent copy would hash to a key that never matches at send time, silently defeating the
 * module's defining invariant with no error anywhere — and then keys the row on {@code v1:} + lower-hex
 * HMAC-SHA-256(pepper, normalized) on <em>both</em> read and write — so no cleartext address ever
 * reaches the table, lookups hit the {@code UNIQUE (email_key)} index regardless of the caller's
 * casing, and the future #372 bounce feed inherits normalization + hashing for free. The cleartext
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
	// 2 s, not 5: since #390 this also bounds a user-facing read (see boundedClient).
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
	 * A {@link JdbcClient} of this adapter's own, with a finite {@code queryTimeout} (#386).
	 *
	 * <p>Postgres's default statement timeout is infinite, so one wedged read — a lock wait, a
	 * pathological plan — has no natural end. #368 gave the SMTP round-trip finite timeouts for exactly
	 * this reason; this closes the other half, the half that arrived later with the suppression check.
	 *
	 * <p><strong>Three callers now, with different stakes.</strong> On the recovery vehicle
	 * {@code isSuppressed} runs on {@code AsyncMailDispatcher}'s <strong>single</strong> drainer thread
	 * behind a 100-slot queue, where a wedged read stalls the whole mail queue and then silently drops
	 * every new send once the buffer fills. Since #390 it is <em>also</em> reached from
	 * {@code SuppressedConfirmationMailDelivery} on a <strong>request</strong> thread, serving the
	 * confirmed-booking read, and since #400 from {@code MailDeliverabilityService} on a request thread
	 * too, serving the authenticated verification-resend — so the same bound is now what stops a wedged
	 * read from holding a user-facing response open, and it is the ceiling on that latency rather than a
	 * queue-drain concern alone. That is why the default is <strong>2 s</strong> and not the 5 s a mail
	 * queue alone would tolerate: both request-thread callers degrade to "no notice" on timeout, so a
	 * shorter bound costs an advisory line and saves the page carrying the guest's booking code. The mail
	 * path is unharmed — there a timeout fails open (recovery) or propagates for retry (registry).
	 *
	 * <p>The count in this paragraph is load-bearing and has now gone stale twice: <strong>wiring a new
	 * caller means editing it</strong>, because "different stakes" is the whole argument for the value.
	 *
	 * <p>Note what this does <em>not</em> bound: {@code queryTimeout} limits execution on a connection
	 * already acquired, so a genuinely exhausted pool is still governed by the pool's own acquisition
	 * timeout, not by this.
	 *
	 * <p><strong>Scoped here on purpose, not set globally.</strong> The obvious instrument,
	 * {@code spring.jdbc.template.query-timeout}, bounds <em>every</em> statement in the application —
	 * including {@code availability}'s {@code INSERT … ON CONFLICT (set_id, booking_date) DO NOTHING}
	 * claim, the serialization point of invariant #2, whose loser waits on the winner's index tuple
	 * lock until it commits. Under set contention that legitimate wait could then abort as a timeout
	 * rather than serialize, turning the platform's single most important correctness guarantee into a
	 * flaky one to fix a mail-queue concern. A dedicated client keeps the blast radius at this one
	 * lookup. (Corrected by #451: this paragraph said {@code SELECT … FOR UPDATE}, which that claim
	 * path does not use — the conclusion holds by the lock-wait route instead.)
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
	 * The upsert, which since #391 also <strong>clears {@code reinstated_at}</strong> — that is the
	 * whole re-suppression path: a bounce after a reinstatement needs no new code, only the flag reset,
	 * and {@code first_suppressed_at} survives the cycle (the point of a flag over a {@code DELETE}).
	 *
	 * <p><strong>Obligation handed to the #372 bounce-feed slice.</strong> Epic #367 parks a finding
	 * for that slice: guard this {@code DO UPDATE} with
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
	 * under concurrency: no row → {@link ReinstateOutcome.NotSuppressed} (and nothing is written); a
	 * row already carrying {@code reinstated_at} → {@link ReinstateOutcome.AlreadyReinstated} with the
	 * <em>original</em> instant, so repeats are idempotent; otherwise the lift happens and we report
	 * {@link ReinstateOutcome.Reinstated}.
	 *
	 * <p><strong>This replaced a single-statement data-modifying CTE, which was wrong</strong> (found
	 * by the #398 review, reproduced against postgres:17). That version claimed the combination
	 * "didn't lift it, yet {@code reinstated_at IS NULL}" was unreachable because the CTE's
	 * {@code UPDATE} and the outer {@code SELECT} share one snapshot. They do — but only while nobody
	 * else touches the row. Under READ COMMITTED an {@code UPDATE} that blocks on a concurrent writer
	 * re-checks its own {@code WHERE} against the <em>newest committed</em> version (EvalPlanQual),
	 * while the outer {@code SELECT} keeps the original snapshot. Two simultaneous reinstates of one
	 * address therefore produced exactly that "unreachable" row, and the mapper dereferenced a null
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
