package ai.riviera.platform.notification.adapter.out;

import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.QueryTimeoutException;

import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.notification.application.EmailSuppressions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * The {@code booking.spi.ConfirmationMailDelivery} answer (#390): the same pair the
 * {@code BookingConfirmed} listener consults before sending — resolve the address via
 * {@code customer}, then the do-not-mail list — so the confirmation surface's claim and the send
 * decision cannot diverge.
 *
 * <p>The failure cases are the point. Unlike the send path, nothing here is retried: the caller is
 * rendering the page that carries the guest's only copy of the booking code, so every unanswerable
 * lookup must degrade to "no notice" rather than fail the read.
 */
class SuppressedConfirmationMailDeliveryTest {

	private static final CustomerId GUEST = new CustomerId(7);
	private static final GuestContact CONTACT =
			new GuestContact("guest@example.com", "Ada Guest", "+355600000");

	private final CustomerLookup customers = mock(CustomerLookup.class);
	private final EmailSuppressions suppressions = mock(EmailSuppressions.class);

	private final SuppressedConfirmationMailDelivery delivery =
			new SuppressedConfirmationMailDelivery(customers, suppressions);

	@Test
	void reportsWithheldForASuppressedContact() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(CONTACT.email())).thenReturn(true);

		assertThat(delivery.isWithheld(GUEST)).isTrue();
	}

	@Test
	void reportsDeliverableForAnUnsuppressedContact() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(CONTACT.email())).thenReturn(false);

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}

	@Test
	void reportsDeliverableForAnUnknownCustomer() {
		when(customers.findById(GUEST)).thenReturn(Optional.empty());

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}

	@Test
	void reportsDeliverableWhenTheSuppressionLookupTimesOut() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(any())).thenThrow(new QueryTimeoutException("wedged"));

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}

	@Test
	void reportsDeliverableWhenTheLookupIsStructurallyBroken() {
		when(customers.findById(GUEST)).thenReturn(Optional.of(CONTACT));
		when(suppressions.isSuppressed(any()))
				.thenThrow(new InvalidDataAccessResourceUsageException("no such column"));

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}

	@Test
	void reportsDeliverableWhenTheContactLookupFails() {
		when(customers.findById(GUEST)).thenThrow(new QueryTimeoutException("wedged"));

		assertThat(delivery.isWithheld(GUEST)).isFalse();
	}
}
