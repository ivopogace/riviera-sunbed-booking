package ai.riviera.platform.payment.application;

import java.time.Instant;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.vocabulary.PayeeRef;

import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * What every {@link PaymentGateway} owes the reconciliation sweep, the collectors and the stub alike: both reads
 * answer rather than throw. Public because each subclass lives in its own adapter's package. A test-scope contract.
 */
public abstract class PaymentGatewayLookupContract {

	protected static final String REFERENCE = "pay_contract";

	protected static final PayeeRef PAYEE = new PayeeRef(11L);

	/** The adapter under test, in the state it is left in with no further arrangement. */
	protected abstract PaymentGateway gateway();

	@Test
	void aLookupAnswers() {
		assertNotNull(gateway().lookup(PAYEE, REFERENCE));
	}

	@Test
	void theListingAnswers() {
		Instant before = Instant.parse("2026-11-01T00:00:00Z");

		assertNotNull(gateway().unpaidCreatedBetween(before.minusSeconds(86_400L), before));
	}
}
