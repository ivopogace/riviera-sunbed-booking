package ai.riviera.platform.customer;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.MovableClock;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.TiraneDaytimeClock;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the guest find-or-create seam (AC-10): a new email creates a customer;
 * a repeat email (in any case) returns the SAME id and refreshes name/phone. Real Postgres
 * via Testcontainers so the {@code ON CONFLICT} upsert is exercised against the constraint.
 *
 * <p>It also covers the read-only twin, {@code CustomerLookup#findByEmail} — the same
 * canonical form, resolving without writing. The context clock is a {@link MovableClock}, so the
 * retention-basis stamp is pinned to an instant the database's {@code now()} cannot produce.
 */
@EnabledIfDockerAvailable
@Import({ TestcontainersConfiguration.class, TiraneDaytimeClock.class })
@SpringBootTest
class CustomerDirectoryIT {

	@Autowired
	CustomerDirectory directory;

	@Autowired
	CustomerLookup lookup;

	@Autowired
	JdbcClient jdbc;

	@Autowired
	MovableClock clock;

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
	 * {@code updated_at} is the retention sweep's basis, and its cutoff comes from the application clock
	 * (#1854): a new guest and a returning one are both stamped with that clock's instant, never the database's.
	 */
	@Test
	void stampsTheRetentionBasisFromTheApplicationClockOnInsertAndOnRefresh() {
		Instant contextStart = clock.instant();
		Instant created = Instant.parse("2024-03-05T08:09:10.123456Z");
		Instant refreshed = created.plus(Duration.ofDays(40)).plusNanos(1_000);
		GuestContact contact = new GuestContact("clock-stamp@example.com", "Clock Guest", "+355600666");
		try {
			clock.set(created);
			CustomerId id = directory.findOrCreate(contact);
			assertEquals(created, updatedAt(id), "a new guest is stamped from the application clock");

			clock.set(refreshed);
			assertEquals(id, directory.findOrCreate(contact));
			assertEquals(refreshed, updatedAt(id), "a returning guest is re-stamped from the application clock");
		}
		finally {
			clock.set(contextStart);
		}
	}

	/**
	 * The read-only by-email resolve, added for the admin mail-delivery view: the guest contact
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

	/**
	 * The batch read: one query resolves many ids; unknown ids are absent from the map, and
	 * an empty input returns an empty map without touching the database (an empty {@code IN ()}
	 * would be invalid SQL — the guard is the contract, this proves it holds).
	 */
	@Test
	void findsABatchOfContactsByIdSkippingUnknownIds() {
		CustomerId cala = directory.findOrCreate(
				new GuestContact("cala@example.com", "Cala Doe", "+355600444"));
		CustomerId dren = directory.findOrCreate(
				new GuestContact("dren@example.com", "Dren Doe", "+355600555"));
		CustomerId unknown = new CustomerId(999_999_999L);

		Map<CustomerId, GuestContact> found = lookup.findByIds(List.of(cala, dren, unknown));

		assertEquals(2, found.size());
		assertEquals("Cala Doe", found.get(cala).fullName());
		assertEquals("Dren Doe", found.get(dren).fullName());

		assertEquals(Map.of(), lookup.findByIds(List.of()), "empty input must not build IN () SQL");
	}

	private Instant updatedAt(CustomerId id) {
		return jdbc.sql("SELECT updated_at FROM customer WHERE id = :id")
				.param("id", id.value()).query(Timestamp.class).single().toInstant();
	}

	private long countCustomers() {
		return jdbc.sql("SELECT count(*) FROM customer").query(Long.class).single();
	}
}
