package ai.riviera.platform.payment.application;

import java.util.List;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.Money;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * The payee contract of the gateways that do not pay a venue's own account (the stub and the Stripe
 * demo, ADR-0029 decision 11): they receive the payee and it changes nothing the provider is asked.
 * Public because each subclass lives in its own adapter's package, as with
 * {@link PaymentGatewayRefundContract}. A test-scope contract, not a published surface.
 */
public abstract class PaymentGatewayPayeeContract {

	protected static final BookingRef BOOKING = new BookingRef(4242L);

	protected static final Money AMOUNT = new Money(4500L, "EUR");

	private static final PayeeRef PAYEE = new PayeeRef(11L);

	private static final PayeeRef OTHER_PAYEE = new PayeeRef(12L);

	/** The adapter under test. */
	protected abstract PaymentGateway gateway();

	/** What the provider is asked, equal-comparable, when {@link #BOOKING} collects {@link #AMOUNT} paying {@code payee}. */
	protected abstract Object providerRequestPaying(PayeeRef payee);

	@Test
	void aCollectionNamingItsPayeeIsInitiated() {
		PaymentOutcome outcome = gateway().initiate(PAYEE,
				List.of(new CollectionShare(BOOKING, PAYEE, AMOUNT)));

		assertFalse(outcome instanceof PaymentOutcome.Failed, "the payee is accepted and the collection initiated");
	}

	@Test
	void thePayeeChangesNothingTheProviderIsAsked() {
		assertEquals(providerRequestPaying(PAYEE), providerRequestPaying(OTHER_PAYEE),
				"this gateway collects into the platform's account, whichever venue is named");
	}
}
