package ai.riviera.platform.notification.adapter.out;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.vocabulary.CustomerId;

/**
 * Answers {@link ConfirmationMailDelivery} with a flat "no" wherever a booking reaching
 * {@code CONFIRMED} is <strong>not</strong> proof that anyone paid (#390).
 *
 * <p>Without the {@code stripe} profile the payment gateway is the in-process stub: it returns
 * {@code Succeeded} synchronously, so {@code POST /api/bookings} answers {@code 201 CONFIRMED} having
 * collected nothing. #390's non-enumeration argument — "after payment, the requester has already
 * demonstrated control of the booking flow for that address, so the leak value is minimal" — has no
 * force there, and the {@code status == CONFIRMED} gate that implements it would degrade into a free
 * suppression oracle: anyone could probe an arbitrary address for the cost of claiming one
 * {@code (set, date)}. So this profile declines to answer at all.
 *
 * <p>The cost is that a stub-gateway deployment never shows the save-your-code notice. That is the
 * right trade: outside prod nothing populates the suppression list automatically (the #370 bounce
 * feed lands with the real provider), so the notice would almost never fire there anyway — whereas
 * the oracle would be real the moment a single address were suppressed by hand.
 *
 * <p>Returning {@code false} rather than throwing keeps the port total: callers must not have to know
 * which profile is active, and #390's surfaces treat "not withheld" as "say nothing extra", which is
 * exactly the desired behavior here. Complementary to
 * {@link SuppressedConfirmationMailDelivery}'s {@code @Profile("stripe")}, so exactly one bean always
 * exists; pinned by {@code ConfirmationMailDeliveryProfileWiringTest}.
 */
@Component
@Profile("!stripe")
class NonDisclosingConfirmationMailDelivery implements ConfirmationMailDelivery {

	@Override
	public boolean isWithheld(CustomerId customerId) {
		return false;
	}
}
