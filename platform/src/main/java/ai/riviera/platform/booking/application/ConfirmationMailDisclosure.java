package ai.riviera.platform.booking.application;

import java.util.Optional;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.spi.ConfirmationMailDelivery;
import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.payment.api.CollectionGuarantee;

/**
 * Who may hear whether a booking's confirmation mail was withheld (#1748): only a signed-in reader who owns a
 * {@code CONFIRMED}, provably collected booking whose contact is the reader's verified address. Every check before the
 * suppression read returns early, so a non-owner's answer reads nothing per address. Rationale: {@code RESPONSIBILITIES.md} §booking.
 */
@Component
public class ConfirmationMailDisclosure {

	private final CollectionGuarantee collection;
	private final ConfirmationMailDelivery confirmationMail;
	private final CustomerAccountDirectory accounts;
	private final Bookings bookings;

	ConfirmationMailDisclosure(CollectionGuarantee collection, ConfirmationMailDelivery confirmationMail,
			CustomerAccountDirectory accounts, Bookings bookings) {
		this.collection = collection;
		this.confirmationMail = confirmationMail;
		this.accounts = accounts;
		this.bookings = bookings;
	}

	/** The disclosure for {@code reader} (the session's account, empty for a guest) on booking {@code bookingId}. */
	public MailDisclosure disclose(BookingStatus status, long bookingId, CustomerId contact,
			Optional<CustomerAccountId> reader) {
		if (status != BookingStatus.CONFIRMED || !collection.provenBeforeConfirmation() || reader.isEmpty()
				|| !bookings.accountOf(bookingId).equals(reader)
				|| !accounts.holdsVerifiedAddress(reader.get(), contact)) {
			return MailDisclosure.UNDISCLOSED;
		}
		return confirmationMail.isWithheld(contact) ? MailDisclosure.WITHHELD : MailDisclosure.EMAILED;
	}
}
