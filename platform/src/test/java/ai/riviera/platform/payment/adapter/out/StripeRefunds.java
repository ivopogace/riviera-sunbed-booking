package ai.riviera.platform.payment.adapter.out;

import java.util.List;
import java.util.Map;

import com.stripe.model.Refund;
import com.stripe.model.StripeCollection;
import com.stripe.param.RefundCreateParams;

import ai.riviera.platform.payment.vocabulary.BookingRef;

/**
 * How the adapter's tests build the Stripe refund shapes they hand a mocked {@code RefundService}.
 *
 * <p>Shared so the two refund test classes — the parameter-asserting unit test and the stateful
 * contract binding — cannot drift on what a `Refund` or a list page looks like when the SDK's shape
 * changes; each still owns its own mock wiring, which is where they genuinely differ.
 */
final class StripeRefunds {

	private StripeRefunds() {
	}

	static Refund refund(String id, String status, Long amountMinor) {
		Refund refund = new Refund();
		refund.setId(id);
		refund.setStatus(status);
		refund.setAmount(amountMinor);
		return refund;
	}

	/** A refund this platform issued after the tag existed: it names the booking it was for. */
	static Refund taggedRefund(String id, String status, Long amountMinor, BookingRef booking) {
		Refund refund = refund(id, status, amountMinor);
		refund.setMetadata(Map.of(StripeRefundTag.KEY, StripeRefundTag.of(booking)));
		return refund;
	}

	/** The metadata a create sent, which the SDK types as {@code Object}; empty when it sent none. */
	@SuppressWarnings("unchecked")
	static Map<String, String> metadataOf(RefundCreateParams params) {
		return params.getMetadata() instanceof Map<?, ?> metadata
				? (Map<String, String>) metadata
				: Map.of();
	}

	/** The page {@code refunds().list(…)} answers with; no arguments means "the account holds none". */
	static StripeCollection<Refund> page(Refund... held) {
		StripeCollection<Refund> page = new StripeCollection<>();
		page.setData(List.of(held));
		return page;
	}
}
