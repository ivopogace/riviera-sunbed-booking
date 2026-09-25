package ai.riviera.platform.payment;

import java.util.List;
import java.util.Map;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * V64's move against a database that stopped at V63: every collection that exists is for one booking
 * whose share is the whole amount, and its refund state — recorded, partial, owed after a failure, or
 * none — must arrive on {@code payment_booking} exactly as it was, so no guest reads as refunded who
 * was not and no owed refund leaves the list. Its own Spring context (the Flyway target) gives it
 * its own container, so the pre-V64 shape is real rather than assumed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.flyway.target=63")
class PaymentBookingBackfillIT {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Flyway flyway;

	@Test
	void everyExistingPaymentBecomesOneBookingRowWithItsRefundIntact() {
		jdbc.sql("""
				INSERT INTO payment (booking_ref, payment_intent_id, amount_minor, currency, status,
				                     refunded_minor, refund_id, refund_attempted_at, refund_failed_at,
				                     failed_refund_id)
				VALUES (6401, 'pi_v64_full',    4500, 'EUR', 'REFUNDED',           4500, 're_v64_full', NULL, NULL, NULL),
				       (6402, 'pi_v64_partial', 4500, 'EUR', 'PARTIALLY_REFUNDED', 2250, 're_v64_part', NULL, NULL, NULL),
				       (6403, 'pi_v64_owed',    4500, 'EUR', 'SUCCEEDED',          0,    NULL, NULL, NOW(), 're_v64_dead'),
				       (6404, 'pi_v64_open',    3000, 'EUR', 'REQUIRES_PAYMENT',   0,    NULL, NULL, NULL, NULL)
				""").update();

		Flyway.configure().configuration(flyway.getConfiguration()).target(MigrationVersion.LATEST)
				.load().migrate();

		List<Map<String, Object>> moved = jdbc.sql("""
				SELECT p.payment_intent_id, b.booking_ref, b.amount_minor, b.refunded_minor, b.refund_id,
				       b.failed_refund_id, (b.refund_failed_at IS NOT NULL) AS owed, p.status
				FROM payment_booking b JOIN payment p ON p.id = b.payment_id
				WHERE p.payment_intent_id LIKE 'pi_v64_%'
				ORDER BY b.booking_ref
				""").query().listOfRows();

		assertEquals(4, moved.size(), "one booking row per pre-V64 collection, no more and no fewer");
		assertRow(moved.get(0), "pi_v64_full", 6401L, 4500L, 4500L, "re_v64_full", null, false, "REFUNDED");
		assertRow(moved.get(1), "pi_v64_partial", 6402L, 4500L, 2250L, "re_v64_part", null, false, "PARTIALLY_REFUNDED");
		assertRow(moved.get(2), "pi_v64_owed", 6403L, 4500L, 0L, null, "re_v64_dead", true, "SUCCEEDED");
		assertRow(moved.get(3), "pi_v64_open", 6404L, 3000L, 0L, null, null, false, "REQUIRES_PAYMENT");

		assertEquals(0L, jdbc.sql("""
				SELECT COUNT(*) FROM information_schema.columns
				WHERE table_name = 'payment' AND column_name IN
				      ('booking_ref', 'refunded_minor', 'refund_id', 'refund_attempted_at',
				       'refund_failed_at', 'failed_refund_id')
				""").query(Long.class).single(),
				"the moved columns leave payment, so nothing can keep writing the old shape");
	}

	private static void assertRow(Map<String, Object> row, String intent, long bookingRef, long share,
			long refunded, String refundId, String failedRefundId, boolean owed, String status) {
		assertEquals(intent, row.get("payment_intent_id"));
		assertEquals(bookingRef, ((Number) row.get("booking_ref")).longValue());
		assertEquals(share, ((Number) row.get("amount_minor")).longValue(), "the share is the whole amount");
		assertEquals(refunded, ((Number) row.get("refunded_minor")).longValue(), "no refunded amount changes");
		assertEquals(refundId, row.get("refund_id"));
		if (failedRefundId == null) {
			assertNull(row.get("failed_refund_id"));
		}
		else {
			assertEquals(failedRefundId, row.get("failed_refund_id"), "the failure trace moves with the row");
		}
		assertEquals(owed, row.get("owed"), "an owed refund stays enumerable");
		assertEquals(status, row.get("status"), "the intent's status is untouched");
	}
}
