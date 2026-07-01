package ai.riviera.platform.customer;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.customer.api.CustomerDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Verifies the guest find-or-create seam (issue #6, AC-10): a new email creates a customer;
 * a repeat email (in any case) returns the SAME id and refreshes name/phone. Real Postgres
 * via Testcontainers so the {@code ON CONFLICT} upsert is exercised against the constraint.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class CustomerDirectoryIT {

	@Autowired
	CustomerDirectory directory;

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
}
