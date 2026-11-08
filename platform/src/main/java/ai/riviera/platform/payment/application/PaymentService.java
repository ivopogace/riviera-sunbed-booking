package ai.riviera.platform.payment.application;

import ai.riviera.platform.payment.api.PaymentCredentialsLookup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CollectionShare;
import ai.riviera.platform.payment.vocabulary.PayeeRef;
import ai.riviera.platform.payment.api.CheckoutPort;
import ai.riviera.platform.payment.vocabulary.PaymentCredentials;
import ai.riviera.platform.payment.vocabulary.PaymentOutcome;

/**
 * Implements the inbound {@link CheckoutPort} by delegating to the outbound
 * {@link PaymentGateway} — the seam between "what booking asks for" (collect for this
 * booking) and "how it is collected" (the stub, or Stripe under {@code stripe}). Package-private; only the
 * {@code api/} port is public (invariant #11). Constructor injection into a {@code final}
 * field (no Lombok, no field {@code @Autowired}).
 */
@Service
class PaymentService implements CheckoutPort, PaymentCredentialsLookup {

	private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

	private final PaymentGateway gateway;
	private final Payments payments;

	PaymentService(PaymentGateway gateway, Payments payments) {
		this.gateway = gateway;
		this.payments = payments;
	}

	@Override
	public PaymentOutcome pay(List<CollectionShare> shares) {
		PayeeRef payee = shares.getFirst().payee();
		if (shares.stream().anyMatch(share -> !payee.equals(share.payee()))) {
			log.warn("refused a collection for booking {}: its shares pay more than one venue",
					shares.getFirst().booking().value());
			return new PaymentOutcome.MixedPayees();
		}
		return gateway.initiate(payee, shares);
	}

	@Override
	public Optional<PaymentCredentials> pendingCredentials(BookingRef booking) {
		return payments.findPendingCredentials(booking);
	}
}
