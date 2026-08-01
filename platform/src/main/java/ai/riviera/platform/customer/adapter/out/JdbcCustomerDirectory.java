package ai.riviera.platform.customer.adapter.out;

import java.util.Collection;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.Emails;
import ai.riviera.platform.customer.vocabulary.GuestContact;

/**
 * JDBC adapter implementing {@link CustomerDirectory} directly (no intervening application
 * service — a single adapter is a hypothetical seam, mirroring {@code JdbcVenueCatalog}).
 * Explicit SQL via {@link JdbcClient}, no JPA (invariant #1).
 *
 * <p>Find-or-create is one atomic statement: {@code INSERT ... ON CONFLICT (email) DO UPDATE}
 * against {@code customer_email_uniq}, returning the id either way. {@code DO UPDATE} (rather
 * than {@code DO NOTHING}) refreshes name/phone to the latest values and guarantees the
 * {@code RETURNING} clause yields a row even on a repeat email. Email is normalised
 * (trimmed, lower-cased) so case/whitespace variants resolve to one guest.
 */
@Repository
class JdbcCustomerDirectory implements CustomerDirectory, ai.riviera.platform.customer.api.CustomerLookup {

	/** Named once, per the {@code JdbcBookings} bind-parameter convention — two call sites bind it. */
	private static final String PARAM_EMAIL = "email";
	private static final String PARAM_PHONE = "phone";

	/** The column, kept apart from the bind parameter above: the two coincide today by accident, not by rule. */
	private static final String COL_EMAIL = "email";

	// Result-column names shared by the row mappers (the JdbcBookings convention).
	private static final String COL_FULL_NAME = "full_name";
	private static final String COL_PHONE = "phone";

	private final JdbcClient jdbc;

	JdbcCustomerDirectory(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public CustomerId findOrCreate(GuestContact contact) {
		String email = Emails.normalize(contact.email());
		long id = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:email, :name, :phone)
				ON CONFLICT (email) DO UPDATE
				SET full_name = EXCLUDED.full_name,
				    phone     = EXCLUDED.phone,
				    updated_at = NOW()
				RETURNING id
				""")
				.param(PARAM_EMAIL, email)
				.param("name", contact.fullName())
				.param(PARAM_PHONE, contact.phone())
				.query(Long.class)
				.single();
		return new CustomerId(id);
	}

	@Override
	public java.util.Optional<CustomerId> findByEmail(String email) {
		// Read-only by design: findOrCreate above would answer the same question by creating a row.
		return jdbc.sql("SELECT id FROM customer WHERE email = :email")
				.param(PARAM_EMAIL, Emails.normalize(email))
				.query((rs, rowNum) -> new CustomerId(rs.getLong("id")))
				.optional();
	}

	@Override
	public java.util.Optional<GuestContact> findById(CustomerId id) {
		return jdbc.sql("SELECT email, full_name, phone FROM customer WHERE id = :id")
				.param("id", id.value())
				.query((rs, rowNum) -> new GuestContact(
						rs.getString(COL_EMAIL), rs.getString(COL_FULL_NAME), rs.getString(COL_PHONE)))
				.optional();
	}

	@Override
	public Map<CustomerId, GuestContact> findByIds(Collection<CustomerId> ids) {
		// Guard before SQL: an empty collection would expand to invalid `IN ()`.
		if (ids.isEmpty()) {
			return Map.of();
		}
		return jdbc.sql("SELECT id, email, full_name, phone FROM customer WHERE id IN (:ids)")
				.param("ids", ids.stream().map(CustomerId::value).toList())
				.query((rs, rowNum) -> Map.entry(
						new CustomerId(rs.getLong("id")),
						new GuestContact(rs.getString(COL_EMAIL), rs.getString(COL_FULL_NAME),
								rs.getString(COL_PHONE))))
				.list().stream()
				.collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue));
	}
}
