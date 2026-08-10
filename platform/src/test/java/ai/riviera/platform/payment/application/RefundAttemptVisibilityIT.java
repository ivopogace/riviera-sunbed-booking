package ai.riviera.platform.payment.application;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

import javax.sql.DataSource;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.payment.domain.PaymentStatus;
import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.RefundResult;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the one property that makes the refund-attempt record useful: it is <strong>committed before
 * the gateway is called</strong>, so a refund-failure webhook arriving mid-call can see it.
 *
 * <p>The fake gateway reads the row back on its own connection, which is what a concurrent webhook
 * request would do. Wrapping {@code RefundService#refund} in a transaction — the obvious-looking
 * tidy-up — would hide the write until the gateway call had already returned and turn the failure
 * webhook back into the silent loss it used to be; this test goes red if that happens.
 *
 * <p>Rationale: {@code RESPONSIBILITIES.md} §{@code payment}.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class RefundAttemptVisibilityIT {

	private static final BookingRef BOOKING = new BookingRef(9901L);
	private static final String INTENT = "pi_attempt_visibility";

	@Autowired
	Payments payments;

	@Autowired
	DataSource dataSource;

	@Test
	void theAttemptIsCommittedBeforeTheGatewayIsAsked() {
		payments.register(new NewPayment(BOOKING, INTENT, 4500L, "EUR", "cs_test_secret"));
		payments.markStatus(INTENT, PaymentStatus.SUCCEEDED);
		boolean[] seenFromAnotherConnection = new boolean[1];
		RefundOnlyGateway gateway = (booking, amount) -> {
			seenFromAnotherConnection[0] = attemptIsVisibleOnItsOwnConnection();
			return new RefundResult.Refunded("re_visibility");
		};

		new RefundService(gateway, new SimpleMeterRegistry(), payments)
				.refund(BOOKING, new Money(4500L, "EUR"));

		assertTrue(seenFromAnotherConnection[0],
				"a webhook handling this refund's failure runs on its own connection — it can only tell "
						+ "our refund from a manual one if the attempt is already committed");
	}

	/** Whether a second connection — like a concurrent webhook request — can see the attempt. */
	private boolean attemptIsVisibleOnItsOwnConnection() {
		try (Connection connection = dataSource.getConnection();
				PreparedStatement statement = connection.prepareStatement(
						"SELECT refund_attempted_at FROM payment WHERE payment_intent_id = ?")) {
			statement.setString(1, INTENT);
			try (ResultSet rows = statement.executeQuery()) {
				return rows.next() && rows.getTimestamp("refund_attempted_at") != null;
			}
		}
		catch (SQLException e) {
			throw new IllegalStateException("could not read the refund attempt back", e);
		}
	}
}
