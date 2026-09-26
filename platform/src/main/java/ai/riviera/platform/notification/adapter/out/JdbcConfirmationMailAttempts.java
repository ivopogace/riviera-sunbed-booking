package ai.riviera.platform.notification.adapter.out;

import java.util.Collection;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.ConfirmationMailAttempts;
import ai.riviera.platform.notification.application.MailAttempt;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;

/**
 * {@link ConfirmationMailAttempts} over the V36 table, package-private (invariant #11).
 *
 * <p>Never {@code @Transactional}: the confirmation listener holds no transaction, so this insert
 * auto-commits and a {@code TRANSPORT_FAILED} row survives the exception the listener rethrows;
 * joining an ambient transaction would roll the evidence back with the failure it records.
 *
 * <p>Tokens are the enum constants' names (V36's {@code CHECK} lists), read back with
 * {@code valueOf}, so a token the enum cannot spell fails loudly rather than being coerced.
 */
@Component
class JdbcConfirmationMailAttempts implements ConfirmationMailAttempts {

	private final JdbcClient jdbc;

	JdbcConfirmationMailAttempts(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public void append(MailAttempt attempt) {
		jdbc.sql("""
				INSERT INTO booking_confirmation_mail_attempt
				    (booking_id, trigger_source, outcome, attempted_at)
				VALUES (:booking, :source, :outcome, :attemptedAt)
				""")
				.param("booking", attempt.bookingId().value())
				.param("source", attempt.source().name())
				.param("outcome", attempt.outcome().name())
				.param("attemptedAt", java.sql.Timestamp.from(attempt.attemptedAt()))
				.update();
	}

	@Override
	public List<MailAttempt> historyFor(Collection<BookingId> bookingIds) {
		if (bookingIds.isEmpty()) {
			// An empty IN list is a SQL syntax error, not an empty result.
			return List.of();
		}
		return jdbc.sql("""
				SELECT booking_id, trigger_source, outcome, attempted_at
				FROM booking_confirmation_mail_attempt
				WHERE booking_id IN (:bookings)
				ORDER BY attempted_at DESC, id DESC
				""")
				.param("bookings", bookingIds.stream().map(BookingId::value).toList())
				.query((rs, n) -> new MailAttempt(
						new BookingId(rs.getLong("booking_id")),
						MailAttemptSource.valueOf(rs.getString("trigger_source")),
						MailAttemptOutcome.valueOf(rs.getString("outcome")),
						rs.getTimestamp("attempted_at").toInstant()))
				.list();
	}
}
