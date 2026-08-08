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
 * {@link ConfirmationMailAttempts} over the V36 {@code booking_confirmation_mail_attempt} table.
 * Package-private driven adapter (invariant #11), plain {@code JdbcClient} + text-block SQL.
 *
 * <p><strong>No {@code @Transactional}, deliberately.</strong> The confirmation listener holds no
 * transaction (#371 dropped {@code REQUIRES_NEW} on purpose), so this insert auto-commits — which is
 * exactly what makes a {@code TRANSPORT_FAILED} row survive the exception the listener then rethrows
 * to keep its publication outstanding. Joining an ambient transaction would roll the evidence back
 * with the failure it records.
 *
 * <p>Tokens are the enum constants' names, matching V36's {@code CHECK} lists; the read maps them back
 * with {@code valueOf}, so a token the enum cannot spell fails loudly here rather than being coerced
 * into a neighbouring value.
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
