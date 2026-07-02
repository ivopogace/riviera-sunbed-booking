package ai.riviera.platform.customer.adapter.out;

import java.util.Locale;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
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

	private final JdbcClient jdbc;

	JdbcCustomerDirectory(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public CustomerId findOrCreate(GuestContact contact) {
		String email = contact.email().trim().toLowerCase(Locale.ROOT);
		long id = jdbc.sql("""
				INSERT INTO customer (email, full_name, phone)
				VALUES (:email, :name, :phone)
				ON CONFLICT (email) DO UPDATE
				SET full_name = EXCLUDED.full_name,
				    phone     = EXCLUDED.phone,
				    updated_at = NOW()
				RETURNING id
				""")
				.param("email", email)
				.param("name", contact.fullName())
				.param("phone", contact.phone())
				.query(Long.class)
				.single();
		return new CustomerId(id);
	}

	@Override
	public java.util.Optional<GuestContact> findById(CustomerId id) {
		return jdbc.sql("SELECT email, full_name, phone FROM customer WHERE id = :id")
				.param("id", id.value())
				.query((rs, rowNum) -> new GuestContact(
						rs.getString("email"), rs.getString("full_name"), rs.getString("phone")))
				.optional();
	}
}
