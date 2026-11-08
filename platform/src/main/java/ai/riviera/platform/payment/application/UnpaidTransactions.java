package ai.riviera.platform.payment.application;

import java.util.List;

/**
 * The provider's unpaid transactions in a creation window: {@link Listed} read to the last page, {@link NotOffered}
 * where the provider has no listing (POK and Paysera Classic document none, #479), or {@link Unavailable} when the
 * read failed part-way, so a partial list is never reported. {@code reason} is a short non-PII code.
 */
public sealed interface UnpaidTransactions {

	record Listed(List<String> references) implements UnpaidTransactions {
	}

	record NotOffered() implements UnpaidTransactions {
	}

	record Unavailable(String reason) implements UnpaidTransactions {
	}
}
