package ai.riviera.platform.notification.application;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.vocabulary.BookingConfirmationFacts;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.customer.vocabulary.CustomerId;
import ai.riviera.platform.venue.vocabulary.SetId;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * The admin resend's own logic: the two refusals it makes before sending anything, the mail it
 * builds from re-read facts, and the fact that <strong>every</strong> path an admin can reach reports an
 * outcome rather than throwing — a human pressed a button and is owed an answer, not a {@code 500}.
 *
 * <p>The refusals are the substance here. "Never confirmed" is not a formality: the mail says <em>your
 * booking is confirmed</em>, so sending it for an unpaid or expired booking would tell the tourist
 * something untrue and invite them to a venue holding no set for them.
 *
 * <p>Companion to {@code AdminMailDeliveryIT}, which proves the end-to-end resend against Postgres —
 * including that it drives no other {@code BookingConfirmed} consumer.
 */
class BookingConfirmationResendServiceTest {

	private static final BookingId BOOKING_ID = new BookingId(42L);
	private static final SetId SET_ID = new SetId(7L);
	private static final String EMAIL = "tourist@example.com";
	private static final String CODE = "ABCD2345";

	private static final BookingConfirmationFacts CONFIRMED = new BookingConfirmationFacts(SET_ID,
			LocalDate.of(2026, 8, 1), 4500L, "EUR", CODE, new CustomerId(9L), true);
	private static final BookingMailFacts.Resolved RESOLVED =
			new BookingMailFacts.Resolved(EMAIL, CODE, "Vala Beach", "A", 3);

	private final BookingNotificationFacts bookings = mock(BookingNotificationFacts.class);
	private final BookingMailFactsService mailFacts = mock(BookingMailFactsService.class);
	private final TransactionalMailService mails = mock(TransactionalMailService.class);
	private final ConfirmationAttemptRecorder attempts = mock(ConfirmationAttemptRecorder.class);

	private final BookingConfirmationResendService service =
			new BookingConfirmationResendService(bookings, mailFacts, mails, attempts);

	@Test
	void sendsTheConfirmationAgainAndRecordsTheAdminAttempt() {
		givenAConfirmedBooking();
		when(mails.sendBookingConfirmation(any(), any())).thenReturn(ConfirmationSendOutcome.SENT);

		assertThat(service.resend(BOOKING_ID)).isEqualTo(ResendOutcome.SENT);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.ADMIN_RESEND, MailAttemptOutcome.SENT);
	}

	/**
	 * The mail is rebuilt from the booking's own facts, since a resend has no event payload to take the
	 * date, amount and currency from. Asserted field-by-field for a simple reason: positional
	 * records make a transposition of two same-typed neighbours invisible to the compiler.
	 */
	@Test
	void rebuildsTheSameMailFromTheReReadFacts() {
		givenAConfirmedBooking();
		when(mails.sendBookingConfirmation(any(), any())).thenReturn(ConfirmationSendOutcome.SENT);

		service.resend(BOOKING_ID);

		verify(mails).sendBookingConfirmation(EMAIL, new BookingConfirmationMail(
				CODE, "Vala Beach", LocalDate.of(2026, 8, 1), "A", 3, 4500L, "EUR"));
	}

	@Test
	void reportsTheSendWithheldForASuppressedAddress() {
		givenAConfirmedBooking();
		when(mails.sendBookingConfirmation(any(), any()))
				.thenReturn(ConfirmationSendOutcome.WITHHELD_SUPPRESSED);

		assertThat(service.resend(BOOKING_ID)).isEqualTo(ResendOutcome.WITHHELD_SUPPRESSED);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.WITHHELD_SUPPRESSED);
	}

	/**
	 * The mirror image of the automatic path, and deliberately so: there the throw is load-bearing (it
	 * keeps the publication outstanding for the registry retry), here there is no publication to keep and
	 * the retry is the admin pressing again — so the failure becomes an answer.
	 */
	@Test
	void reportsAndRecordsATransportFailure() {
		givenAConfirmedBooking();
		doThrow(new IllegalStateException("relay down")).when(mails).sendBookingConfirmation(any(), any());

		assertThat(service.resend(BOOKING_ID)).isEqualTo(ResendOutcome.TRANSPORT_FAILED);

		verify(attempts).recordAttempt(BOOKING_ID, MailAttemptSource.ADMIN_RESEND,
				MailAttemptOutcome.TRANSPORT_FAILED);
	}

	@Test
	void reportsNoSuchBookingWithoutSendingOrRecordingAnything() {
		when(bookings.confirmationFacts(BOOKING_ID)).thenReturn(Optional.empty());

		assertThat(service.resend(BOOKING_ID)).isEqualTo(ResendOutcome.NO_SUCH_BOOKING);

		verifyNoInteractions(mails);
		verifyNoInteractions(attempts);
	}

	/**
	 * The refusal that protects the tourist rather than the admin. Nothing is recorded either: no attempt
	 * was made, and a log of attempts that never happened would be noise in the one place support reads.
	 */
	@Test
	void refusesABookingThatWasNeverConfirmed() {
		when(bookings.confirmationFacts(BOOKING_ID)).thenReturn(Optional.of(new BookingConfirmationFacts(
				SET_ID, LocalDate.of(2026, 8, 1), 4500L, "EUR", CODE, new CustomerId(9L), false)));

		assertThat(service.resend(BOOKING_ID)).isEqualTo(ResendOutcome.NOT_CONFIRMED);

		verify(mails, never()).sendBookingConfirmation(any(), any());
		verifyNoInteractions(attempts);
	}

	@ParameterizedTest(name = "{0}")
	@EnumSource(MissingBookingFact.class)
	void reportsAndRecordsAMissingFact(MissingBookingFact fact) {
		when(bookings.confirmationFacts(BOOKING_ID)).thenReturn(Optional.of(CONFIRMED));
		when(mailFacts.resolve(BOOKING_ID, SET_ID)).thenReturn(new BookingMailFacts.Missing(fact));

		assertThat(service.resend(BOOKING_ID)).isEqualTo(ResendOutcome.MISSING_FACTS);

		verify(mails, never()).sendBookingConfirmation(any(), any());
		verify(attempts).recordAttempt(eq(BOOKING_ID), eq(MailAttemptSource.ADMIN_RESEND),
				eq(MailAttemptOutcome.ABANDONED_MISSING_FACTS));
	}

	private void givenAConfirmedBooking() {
		when(bookings.confirmationFacts(BOOKING_ID)).thenReturn(Optional.of(CONFIRMED));
		when(mailFacts.resolve(BOOKING_ID, SET_ID)).thenReturn(RESOLVED);
	}
}
