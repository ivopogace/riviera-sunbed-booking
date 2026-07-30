package ai.riviera.platform.notification.adapter.out;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.notification.application.ConfirmationMailAttempts;
import ai.riviera.platform.notification.application.MailAttempt;
import ai.riviera.platform.notification.application.MailAttemptOutcome;
import ai.riviera.platform.notification.application.MailAttemptSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The confirmation-mail attempt log against real Postgres (#380, Email S9): the V36
 * {@code booking_confirmation_mail_attempt} table plus the {@code JdbcConfirmationMailAttempts}
 * adapter behind the {@link ConfirmationMailAttempts} port.
 *
 * <p>Pins what unit tests cannot. Three of them are the reason the table exists rather than the Event
 * Publication Registry: the log records an <em>outcome</em> per attempt (a suppression skip is not a
 * send), it accepts repeat attempts for one booking (two admins really can press Resend twice, so
 * there is deliberately no unique constraint), and it holds <strong>no</strong> recipient address and
 * no arrival code — the address stays inside {@code customer} (ADR-0010 erasure reach) and the code is
 * a bearer credential (invariant #7).
 *
 * <p>The two token specs are the Java↔SQL lockstep (`riviera-java-conventions` §6a): every enum
 * constant must satisfy its {@code CHECK}, and a token no enum spells must be rejected. Renaming a
 * constant without the matching migration therefore fails here rather than at the first production
 * send.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class ConfirmationMailAttemptsIT {

	@Autowired
	ConfirmationMailAttempts attempts;

	@Autowired
	JdbcClient jdbc;

	@Test
	void readsBackTheAttemptsForABookingNewestFirst() {
		BookingId booking = seedBooking("ATTEMPT1");

		attempts.append(new MailAttempt(booking, MailAttemptSource.AUTOMATIC,
				MailAttemptOutcome.WITHHELD_SUPPRESSED, Instant.parse("2026-07-03T12:02:11Z")));
		attempts.append(new MailAttempt(booking, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.SENT, Instant.parse("2026-07-04T09:31:00Z")));

		List<MailAttempt> history = attempts.historyFor(List.of(booking));

		assertThat(history).containsExactly(
				new MailAttempt(booking, MailAttemptSource.ADMIN_RESEND, MailAttemptOutcome.SENT,
						Instant.parse("2026-07-04T09:31:00Z")),
				new MailAttempt(booking, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.WITHHELD_SUPPRESSED,
						Instant.parse("2026-07-03T12:02:11Z")));
	}

	@Test
	void keepsEveryRepeatAttemptForOneBooking() {
		BookingId booking = seedBooking("ATTEMPT2");
		MailAttempt sameMoment = new MailAttempt(booking, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.SENT, Instant.parse("2026-07-05T08:00:00Z"));

		attempts.append(sameMoment);
		attempts.append(sameMoment);

		assertThat(attempts.historyFor(List.of(booking))).hasSize(2);
	}

	@Test
	void readsOnlyTheRequestedBookings() {
		BookingId wanted = seedBooking("ATTEMPT3");
		BookingId other = seedBooking("ATTEMPT4");
		attempts.append(anAttempt(wanted));
		attempts.append(anAttempt(other));

		assertThat(attempts.historyFor(List.of(wanted)))
				.extracting(MailAttempt::bookingId).containsExactly(wanted);
	}

	/** An empty id list must not reach the database as {@code IN ()} — a syntax error, not an empty result. */
	@Test
	void answersAnEmptyHistoryForNoBookings() {
		assertThat(attempts.historyFor(List.of())).isEmpty();
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MailAttemptSource.class)
	void storesEverySourceTheEnumSpells(MailAttemptSource source) {
		BookingId booking = seedBooking("SRC" + source.ordinal());

		attempts.append(new MailAttempt(booking, source, MailAttemptOutcome.SENT, Instant.now()));

		assertThat(attempts.historyFor(List.of(booking)))
				.extracting(MailAttempt::source).containsExactly(source);
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MailAttemptOutcome.class)
	void storesEveryOutcomeTheEnumSpells(MailAttemptOutcome outcome) {
		BookingId booking = seedBooking("OUT" + outcome.ordinal());

		attempts.append(new MailAttempt(booking, MailAttemptSource.AUTOMATIC, outcome, Instant.now()));

		assertThat(attempts.historyFor(List.of(booking)))
				.extracting(MailAttempt::outcome).containsExactly(outcome);
	}

	@Test
	void rejectsAnOutcomeTokenNoEnumSpells() {
		BookingId booking = seedBooking("BADTOKEN");

		assertThatThrownBy(() -> jdbc.sql("""
				INSERT INTO booking_confirmation_mail_attempt
				    (booking_id, trigger_source, outcome, attempted_at)
				VALUES (:booking, 'AUTOMATIC', 'DELIVERED', now())
				""").param("booking", booking.value()).update())
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void rejectsAnAttemptForABookingThatDoesNotExist() {
		assertThatThrownBy(() -> attempts.append(anAttempt(new BookingId(-1L))))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	/**
	 * The storage posture, asserted against the catalog rather than trusted from the migration text: a
	 * column added later to "make support easier" would silently give this table an erasure obligation
	 * it is built not to have.
	 */
	@Test
	void storesNoRecipientAddressOrArrivalCode() {
		List<String> columns = jdbc.sql("""
				SELECT column_name FROM information_schema.columns
				WHERE table_name = 'booking_confirmation_mail_attempt'
				""").query(String.class).list();

		assertThat(columns).containsExactlyInAnyOrder(
				"id", "booking_id", "trigger_source", "outcome", "attempted_at");
	}

	private static MailAttempt anAttempt(BookingId booking) {
		return new MailAttempt(booking, MailAttemptSource.AUTOMATIC, MailAttemptOutcome.SENT,
				Instant.parse("2026-07-06T07:00:00Z"));
	}

	/** A booking row to hang attempts off; the FK is real, so a stub id will not do. */
	private BookingId seedBooking(String code) {
		long customerId = jdbc.sql("INSERT INTO customer (email, full_name, phone) "
						+ "VALUES (:e, 'Attempt Guest', '+355777') RETURNING id")
				.param("e", "attempt-" + code.toLowerCase() + "@example.com")
				.query(Long.class).single();
		return new BookingId(jdbc.sql("""
				INSERT INTO booking (code, venue_id, set_id, customer_id, booking_date,
				                     amount_minor, amount_currency, status)
				SELECT :code, sp.venue_id, sp.id, :cust, :date, 2500, 'EUR', 'CONFIRMED'
				FROM set_position sp WHERE sp.pool = 'ONLINE' ORDER BY sp.id LIMIT 1
				RETURNING id
				""")
				.param("code", code).param("cust", customerId)
				.param("date", LocalDate.of(2030, 5, 1))
				.query(Long.class).single());
	}
}
