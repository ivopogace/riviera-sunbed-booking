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
 * V70's move against a database that stopped at V69: every share that carries a refund — recorded,
 * partial, still attempted, or dead and owed — must arrive as one {@code BOOKING}-scope
 * {@code payment_refund} row exactly as it was, and a share never refunded must get none, so no guest
 * reads as refunded who was not and no owed refund leaves the list. Its own Spring context (the Flyway
 * target) gives it its own container, so the pre-V70 shape is real rather than assumed.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest(properties = "spring.flyway.target=69")
class PaymentRefundBackfillIT {

	@Autowired
	JdbcClient jdbc;

	@Autowired
	Flyway flyway;

	@Test
	void everyExistingRefundBecomesOneBookingScopeRowAndAFreshShareNone() {
		jdbc.sql("""
				INSERT INTO payment (payment_intent_id, amount_minor, currency, status)
				VALUES ('pi_v70_full', 4500, 'EUR', 'REFUNDED'),
				       ('pi_v70_partial', 4500, 'EUR', 'PARTIALLY_REFUNDED'),
				       ('pi_v70_owed', 4500, 'EUR', 'SUCCEEDED'),
				       ('pi_v70_attempted', 4500, 'EUR', 'SUCCEEDED'),
				       ('pi_v70_open', 3000, 'EUR', 'REQUIRES_PAYMENT')
				""").update();
		jdbc.sql("""
				INSERT INTO payment_booking (payment_id, booking_ref, amount_minor, refunded_minor, refund_id,
				                             refund_attempted_at, refund_failed_at, failed_refund_id)
				SELECT p.id, v.ref, p.amount_minor, v.refunded, v.refund_id, v.attempted, v.failed, v.failed_id
				FROM payment p
				JOIN (VALUES ('pi_v70_full',      7001, 4500, 're_v70_full', NULL::timestamptz, NULL::timestamptz, NULL),
				             ('pi_v70_partial',   7002, 2250, 're_v70_part', NULL, NULL, NULL),
				             ('pi_v70_owed',      7003, 0,    NULL,          NULL, NOW(), 're_v70_dead'),
				             ('pi_v70_attempted', 7004, 0,    NULL,          NOW(), NULL, NULL),
				             ('pi_v70_open',      7005, 0,    NULL,          NULL, NULL, NULL))
				     AS v(intent, ref, refunded, refund_id, attempted, failed, failed_id) ON v.intent = p.payment_intent_id
				""").update();

		Flyway.configure().configuration(flyway.getConfiguration()).target(MigrationVersion.LATEST)
				.load().migrate();

		List<Map<String, Object>> moved = jdbc.sql("""
				SELECT b.booking_ref, r.scope, r.service_date, r.amount_minor, r.refund_id, r.failed_refund_id,
				       (r.attempted_at IS NOT NULL) AS attempted, (r.failed_at IS NOT NULL) AS owed, b.refunded_minor
				FROM payment_refund r JOIN payment_booking b ON b.id = r.payment_booking_id
				JOIN payment p ON p.id = b.payment_id
				WHERE p.payment_intent_id LIKE 'pi_v70_%'
				ORDER BY b.booking_ref
				""").query().listOfRows();

		assertEquals(4, moved.size(), "one refund row per share that carried a refund; the untouched share gets none");
		assertRow(moved.get(0), 7001L, 4500L, "re_v70_full", null, false, false);
		assertRow(moved.get(1), 7002L, 2250L, "re_v70_part", null, false, false);
		assertRow(moved.get(2), 7003L, 0L, null, "re_v70_dead", false, true);
		assertRow(moved.get(3), 7004L, 0L, null, null, true, false);

		assertEquals(0L, jdbc.sql("""
				SELECT COUNT(*) FROM information_schema.columns
				WHERE table_name = 'payment_booking' AND column_name IN
				      ('refund_id', 'refund_attempted_at', 'refund_failed_at', 'failed_refund_id')
				""").query(Long.class).single(),
				"the moved columns leave payment_booking, so nothing can keep writing the old shape");
		assertEquals(List.of(4500L, 2250L, 0L, 0L, 0L), jdbc.sql("""
				SELECT b.refunded_minor FROM payment_booking b JOIN payment p ON p.id = b.payment_id
				WHERE p.payment_intent_id LIKE 'pi_v70_%' ORDER BY b.booking_ref
				""").query(Long.class).list(), "the running sum on the share is untouched");
	}

	private static void assertRow(Map<String, Object> row, long bookingRef, long amount, String refundId,
			String failedRefundId, boolean attempted, boolean owed) {
		assertEquals(bookingRef, ((Number) row.get("booking_ref")).longValue());
		assertEquals("BOOKING", row.get("scope"), "every pre-V70 refund was the whole share's");
		assertNull(row.get("service_date"));
		assertEquals(amount, ((Number) row.get("amount_minor")).longValue(), "no refunded amount changes");
		assertEquals(refundId, row.get("refund_id"));
		if (failedRefundId == null) {
			assertNull(row.get("failed_refund_id"));
		}
		else {
			assertEquals(failedRefundId, row.get("failed_refund_id"), "the failure trace moves with the refund");
		}
		assertEquals(attempted, row.get("attempted"), "an unresolved attempt stays one");
		assertEquals(owed, row.get("owed"), "an owed refund stays enumerable");
	}
}
