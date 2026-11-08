package ai.riviera.platform.payment.adapter.out;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.payment.application.ReconcilablePayment;
import ai.riviera.platform.payment.application.ReconcilablePayments;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.PayeeRef;

/**
 * JDBC adapter for {@link ReconcilablePayments}: read-only SQL on a client bounded by
 * {@code riviera.scheduled.query-timeout-seconds}, as a scheduled job's reads are ({@code ScheduledQueryTimeout}).
 * Package-private; the bound is scoped here, never global (invariant #2).
 */
@Repository
class JdbcReconcilablePayments implements ReconcilablePayments {

	private static final String SELECT_COLUMNS = """
			SELECT p.id, p.payment_intent_id, p.status, p.payee_venue_id,
			       ARRAY(SELECT b.booking_ref FROM payment_booking b WHERE b.payment_id = p.id ORDER BY b.id) AS bookings
			FROM payment p
			""";

	private static final List<String> OPEN_STATUSES = Arrays.stream(PaymentStatus.values())
			.filter(PaymentStatus::isOpen)
			.map(PaymentStatus::name)
			.toList();

	private final JdbcClient jdbc;

	JdbcReconcilablePayments(DataSource dataSource,
			@Value("${riviera.scheduled.query-timeout-seconds}") int queryTimeoutSeconds) {
		JdbcTemplate bounded = new JdbcTemplate(dataSource);
		bounded.setQueryTimeout(queryTimeoutSeconds);
		this.jdbc = JdbcClient.create(bounded);
	}

	@Override
	public List<ReconcilablePayment> findOpenCreatedBetween(Instant from, Instant before, long afterId, int limit) {
		return jdbc.sql(SELECT_COLUMNS + """
				WHERE p.status IN (:open) AND p.created_at >= :from AND p.created_at < :before AND p.id > :after
				ORDER BY p.id
				LIMIT :limit
				""")
				.param("open", OPEN_STATUSES)
				.param("from", Timestamp.from(from))
				.param("before", Timestamp.from(before))
				.param("after", afterId)
				.param("limit", limit)
				.query(JdbcReconcilablePayments::row)
				.list();
	}

	@Override
	public Optional<ReconcilablePayment> findById(long paymentId) {
		return jdbc.sql(SELECT_COLUMNS + " WHERE p.id = :id")
				.param("id", paymentId)
				.query(JdbcReconcilablePayments::row)
				.optional();
	}

	@Override
	public Set<String> knownReferences(Collection<String> references) {
		if (references.isEmpty()) {
			return Set.of();
		}
		return new HashSet<>(jdbc.sql("SELECT payment_intent_id FROM payment WHERE payment_intent_id IN (:references)")
				.param("references", List.copyOf(references))
				.query(String.class)
				.list());
	}

	private static ReconcilablePayment row(ResultSet rs, int rowNum) throws SQLException {
		long payee = rs.getLong("payee_venue_id");
		Optional<PayeeRef> paying = rs.wasNull() ? Optional.empty() : Optional.of(new PayeeRef(payee));
		Long[] bookings = (Long[]) rs.getArray("bookings").getArray();
		return new ReconcilablePayment(rs.getLong("id"), rs.getString("payment_intent_id"),
				PaymentStatus.valueOf(rs.getString("status")), paying,
				Arrays.stream(bookings).map(BookingRef::new).toList());
	}
}
