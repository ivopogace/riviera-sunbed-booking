package ai.riviera.platform.payment.api;

import java.util.Optional;

import ai.riviera.platform.payment.vocabulary.BookingRef;
import ai.riviera.platform.payment.vocabulary.CheckoutInstruction;

/**
 * The read side of the checkout conversation, split from {@link CheckoutPort} by consumer role: the
 * booking view asks "how can this booking be paid now?", so a Request-to-Book guest can pay after the
 * venue accepts, when the collection was created and the guest was not at the checkout.
 */
public interface CheckoutInstructionLookup {

	/** The instruction of the booking's still-open collection, or empty when none is payable (none begun, or closed). */
	Optional<CheckoutInstruction> openInstruction(BookingRef booking);
}
