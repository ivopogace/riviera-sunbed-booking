package ai.riviera.platform.payment.adapter.out;

import java.util.List;

import com.stripe.model.Refund;
import com.stripe.model.StripeCollection;

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

	/** The page {@code refunds().list(…)} answers with; no arguments means "the account holds none". */
	static StripeCollection<Refund> page(Refund... held) {
		StripeCollection<Refund> page = new StripeCollection<>();
		page.setData(List.of(held));
		return page;
	}
}
