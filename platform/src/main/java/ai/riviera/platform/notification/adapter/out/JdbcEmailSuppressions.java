package ai.riviera.platform.notification.adapter.out;

import java.time.Instant;
import java.util.Locale;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import ai.riviera.platform.notification.application.EmailSuppressions;
import ai.riviera.platform.notification.application.SuppressionReason;

/**
 * {@link EmailSuppressions} over the V32 {@code email_suppression} table (#382). Normalizes the
 * address (trim + lower-case, the {@code customer} module's canonical form) on both read and write,
 * so lookups hit the {@code UNIQUE (email)} index regardless of the caller's casing; the repeat
 * suppression is an {@code ON CONFLICT} upsert refreshing reason + {@code last_event_at} while
 * keeping {@code first_suppressed_at}. Package-private driven adapter (invariant #11).
 */
@Component
class JdbcEmailSuppressions implements EmailSuppressions {

	private final JdbcClient jdbc;

	JdbcEmailSuppressions(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean isSuppressed(String email) {
		return jdbc.sql("""
				SELECT EXISTS (SELECT 1 FROM email_suppression WHERE email = :email)
				""")
				.param("email", normalize(email))
				.query(Boolean.class)
				.single();
	}

	@Override
	public void suppress(String email, SuppressionReason reason, Instant at) {
		jdbc.sql("""
				INSERT INTO email_suppression (email, reason, first_suppressed_at, last_event_at)
				VALUES (:email, :reason, :at, :at)
				ON CONFLICT (email) DO UPDATE
				SET reason = EXCLUDED.reason, last_event_at = EXCLUDED.last_event_at
				""")
				.param("email", normalize(email))
				.param("reason", reason.name())
				.param("at", java.sql.Timestamp.from(at))
				.update();
	}

	private static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
