package ai.riviera.platform.booking.adapter.out;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.application.cancel.CancellationPolicy;
import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

/**
 * JDBC adapter for {@link BookingNotificationFacts} — both reads are by primary key via
 * {@link JdbcClient} (invariant #1, no JPA): two columns for the listener's narrow
 * {@code notificationInfo}, and since #380 the wider {@code confirmationFacts} an admin resend
 * rebuilds the mail from. Package-private; only the {@code api/} port is
 * referenced cross-module (invariant #11). Read-only.
 */
@Repository
class JdbcBookingNotificationFacts implements BookingNotificationFacts {

	private final JdbcClient jdbc;
	private final CancellationPolicy cancellationPolicy;

	JdbcBookingNotificationFacts(JdbcClient jdbc, CancellationPolicy cancellationPolicy) {
		this.jdbc = jdbc;
		this.cancellationPolicy = cancellationPolicy;
	}

	@Override
	public Optional<BookingNotificationInfo> notificationInfo(BookingId bookingId) {
		// No status predicate on purpose — the caller reacts to a published confirmation fact, and a
		// booking cancelled in the interim must still resolve (the port's contract).
		return jdbc.sql("SELECT code, customer_id FROM booking WHERE id = :id")
				.param("id", bookingId.value())
				.query((rs, rowNum) -> new BookingNotificationInfo(
						rs.getString("code"), new CustomerId(rs.getLong("customer_id"))))
				.optional();
	}

	@Override
	public Optional<BookingConfirmationFacts> confirmationFacts(BookingId bookingId) {
		// confirmed_at, not status — see BookingConfirmationFacts#everConfirmed for why.
		return jdbc.sql("""
				SELECT set_id, booking_date, amount_minor, amount_currency, code, customer_id,
				       confirmed_at IS NOT NULL AS ever_confirmed, created_at
				FROM booking WHERE id = :id
				""")
				.param("id", bookingId.value())
				.query((rs, rowNum) -> factsOf(rs))
				.optional();
	}

	/**
	 * A resend has no event payload, so the window-at-birth is re-derived here from the venue's
	 * current cutoff via {@code CancellationPolicy} — bounded, documented drift after a cutoff edit
	 * (#795); the automatic listener's stamped event stays the record of what was first sent.
	 */
	private BookingConfirmationFacts factsOf(java.sql.ResultSet rs) throws java.sql.SQLException {
		SetId setId = new SetId(rs.getLong("set_id"));
		LocalDate bookingDate = rs.getObject("booking_date", LocalDate.class);
		Optional<CancellationPolicy.BirthTerms> birth = cancellationPolicy.windowAtBirth(
				setId, bookingDate, rs.getTimestamp("created_at").toInstant());
		return new BookingConfirmationFacts(
				setId,
				bookingDate,
				rs.getLong("amount_minor"),
				rs.getString("amount_currency"),
				rs.getString("code"),
				new CustomerId(rs.getLong("customer_id")),
				rs.getBoolean("ever_confirmed"),
				birth.map(CancellationPolicy.BirthTerms::window).orElse(null),
				birth.map(CancellationPolicy.BirthTerms::lateCancelRefundBps).orElse(0));
	}
}
