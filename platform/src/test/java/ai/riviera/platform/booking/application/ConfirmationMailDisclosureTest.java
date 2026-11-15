package ai.riviera.platform.booking.application;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.payment.api.CollectionGuarantee;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The owner-verified disclosure rule (#1748, OWASP WSTG-IDNT-04): the suppression port answers only the signed-in owner
 * of a collected booking whose contact is their verified address; for every other reader it is never even asked, so
 * there is nothing to time.
 */
class ConfirmationMailDisclosureTest {

	private static final long BOOKING = 41L;
	private static final CustomerId CONTACT = new CustomerId(7);
	private static final CustomerAccountId OWNER = new CustomerAccountId(3);
	private static final CustomerAccountId STRANGER = new CustomerAccountId(9);

	private final CollectionGuarantee collection = mock(CollectionGuarantee.class);
	private final ConfirmationMailDelivery mail = mock(ConfirmationMailDelivery.class);
	private final CustomerAccountDirectory accounts = mock(CustomerAccountDirectory.class);
	private final Bookings bookings = mock(Bookings.class);
	private final ConfirmationMailDisclosure disclosure =
			new ConfirmationMailDisclosure(collection, mail, accounts, bookings);

	@BeforeEach
	void aCollectedBookingOwnedByTheVerifiedHolderOfItsAddress() {
		when(collection.provenBeforeConfirmation()).thenReturn(true);
		when(bookings.accountOf(BOOKING)).thenReturn(Optional.of(OWNER));
		when(accounts.holdsVerifiedAddress(OWNER, CONTACT)).thenReturn(true);
	}

	@Test
	void theVerifiedOwnerOfASuppressedAddressIsToldTheMailWasWithheld() {
		when(mail.isWithheld(CONTACT)).thenReturn(true);

		assertThat(disclose(Optional.of(OWNER))).isEqualTo(MailDisclosure.WITHHELD);
	}

	@Test
	void theVerifiedOwnerOfADeliverableAddressIsToldItWasEmailed() {
		assertThat(disclose(Optional.of(OWNER))).isEqualTo(MailDisclosure.EMAILED);
	}

	@Test
	void aReaderWithoutASessionIsNeverAnswered() {
		when(mail.isWithheld(CONTACT)).thenReturn(true);

		assertThat(disclose(Optional.empty())).isEqualTo(MailDisclosure.UNDISCLOSED);
		verifyNoInteractions(mail, accounts, bookings);
	}

	@Test
	void aSignedInReaderOfSomeoneElsesBookingIsNeverAnswered() {
		assertThat(disclose(Optional.of(STRANGER))).isEqualTo(MailDisclosure.UNDISCLOSED);
		verifyNoInteractions(mail, accounts);
	}

	@Test
	void anOwnerWhoseContactIsNotTheirVerifiedAddressIsNeverAnswered() {
		// The attacker case: their own account, the victim's address as the booking's contact.
		when(accounts.holdsVerifiedAddress(OWNER, CONTACT)).thenReturn(false);

		assertThat(disclose(Optional.of(OWNER))).isEqualTo(MailDisclosure.UNDISCLOSED);
		verifyNoInteractions(mail);
	}

	@Test
	void aGuestBookingReadBySomeSignedInCustomerIsNeverAnswered() {
		when(bookings.accountOf(BOOKING)).thenReturn(Optional.empty());

		assertThat(disclose(Optional.of(OWNER))).isEqualTo(MailDisclosure.UNDISCLOSED);
		verify(accounts, never()).holdsVerifiedAddress(any(), any());
		verifyNoInteractions(mail);
	}

	@Test
	void nothingIsDisclosedWhereConfirmationProvesNoCollection() {
		when(collection.provenBeforeConfirmation()).thenReturn(false);

		assertThat(disclose(Optional.of(OWNER))).isEqualTo(MailDisclosure.UNDISCLOSED);
		verifyNoInteractions(mail, accounts, bookings);
	}

	@ParameterizedTest
	@EnumSource(value = BookingStatus.class, names = "CONFIRMED", mode = EnumSource.Mode.EXCLUDE)
	void nothingIsDisclosedBeforeConfirmation(BookingStatus status) {
		assertThat(disclosure.disclose(status, BOOKING, CONTACT, Optional.of(OWNER)))
				.isEqualTo(MailDisclosure.UNDISCLOSED);
		verifyNoInteractions(mail, accounts, bookings);
	}

	private MailDisclosure disclose(Optional<CustomerAccountId> reader) {
		return disclosure.disclose(BookingStatus.CONFIRMED, BOOKING, CONTACT, reader);
	}
}
