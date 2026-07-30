package ai.riviera.platform.customer;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the guest find-or-create seam (issue #6, AC-10): a new email creates a customer;
 * a repeat email (in any case) returns the SAME id and refreshes name/phone. Real Postgres
 * via Testcontainers so the {@code ON CONFLICT} upsert is exercised against the constraint.
 *
 * <p>Since #380 it also covers the read-only twin, {@code CustomerLookup#findByEmail} — the same
 * canonical form, resolving without writing.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CustomerDirectoryIT {

	@Autowired
	CustomerDirectory directory;

	@Autowired
	CustomerLookup lookup;

	@Autowired
	JdbcClient jdbc;

	@Test
	void findOrCreateByEmail() {
		CustomerId first = directory.findOrCreate(
				new GuestContact("Ana@Example.com", "Ana Doe", "+355600111"));
		CustomerId second = directory.findOrCreate(
				new GuestContact("  ana@example.com  ", "Ana Updated", "+355600222"));

		assertEquals(first.value(), second.value(),
				"the same email (case/space-insensitive) must resolve to one guest id");

		String name = jdbc.sql("SELECT full_name FROM customer WHERE id = :id")
				.param("id", first.value()).query(String.class).single();
		String phone = jdbc.sql("SELECT phone FROM customer WHERE id = :id")
				.param("id", first.value()).query(String.class).single();
		assertEquals("Ana Updated", name, "repeat email refreshes the stored name");
		assertEquals("+355600222", phone, "repeat email refreshes the stored phone");
	}

	/**
	 * The read-only by-email resolve (#380), added for the admin mail-delivery view: the guest contact
	 * is what a confirmation mail was addressed to, so an address is the key that view is searched by.
	 * Canonicalisation is the module's own {@code Emails.normalize}, so a caller cannot spell the rule
	 * a second way and miss rows the writer would have matched.
	 */
	@Test
	void findsAnExistingGuestByEmailInAnyCasingOrPadding() {
		CustomerId created = directory.findOrCreate(
				new GuestContact("Bo@Example.com", "Bo Doe", "+355600333"));

		assertEquals(Optional.of(created), lookup.findByEmail("bo@example.com"));
		assertEquals(Optional.of(created), lookup.findByEmail("  BO@Example.COM  "));
	}

	/**
	 * The trap this method exists to avoid: {@link CustomerDirectory#findOrCreate} would have answered
	 * the same question by <em>writing</em> a row, so a support search for an address nobody booked with
	 * would leave a guest contact behind. This read must create nothing.
	 */
	@Test
	void createsNothingForAnAddressNobodyBookedWith() {
		long before = countCustomers();

		assertEquals(Optional.empty(), lookup.findByEmail("never-seen@example.com"));
		assertEquals(before, countCustomers(), "a lookup must not create a guest contact");
	}

	private long countCustomers() {
		return jdbc.sql("SELECT count(*) FROM customer").query(Long.class).single();
	}
}
