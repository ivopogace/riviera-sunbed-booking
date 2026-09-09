package ai.riviera.platform.notification.adapter.in;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;

/**
 * The recording {@link MockMailer}'s booking mails, readable over HTTP so a real-backend e2e run can
 * prove a mail left — present only where the mock transport is (the same profile guard, and so
 * transitively never under {@code prod}, which {@code MockMailerProdGuard} forbids the mock in).
 * Booking kinds only, and of those only the facts a guest would read on the page anyway: never a
 * code, never a link (invariant #7), never a recovery kind. Operator-gated: the e2e run holds an
 * operator session, a guest does not.
 */
@RestController
@RequestMapping("/api/mock-mail")
@Profile("!mailer & !smtp4dev")
class MockMailOutboxController {

	private final MockMailer mailer;

	MockMailOutboxController(MockMailer mailer) {
		this.mailer = mailer;
	}

	@GetMapping("/booking-mails")
	List<BookingMailView> bookingMails(@RequestParam("to") String toEmail) {
		return mailer.sent().stream()
				.filter(sent -> sent.toEmail().equalsIgnoreCase(toEmail))
				.flatMap(sent -> BookingMailView.of(sent).stream())
				.toList();
	}

	/** One booking mail as recorded; {@code from}/{@code to}/{@code freeExitUntil} ride only on a move. */
	record BookingMailView(String kind, String venueName, LocalDate bookingDate, String from, String to,
			Integer rowsAway, Integer positionsAway, Instant freeExitUntil) {

		static Optional<BookingMailView> of(SentEmail sent) {
			return switch (sent.kind()) {
				case BOOKING_MOVED -> Optional.of(new BookingMailView(sent.kind().name(), sent.moved().venueName(),
						sent.moved().bookingDate(), sent.moved().fromRowLabel() + sent.moved().fromPositionNo(),
						sent.moved().toRowLabel() + sent.moved().toPositionNo(), sent.moved().rowsAway(),
						sent.moved().positionsAway(), sent.moved().freeExitUntil()));
				case BOOKING_CANCELLATION -> Optional.of(new BookingMailView(sent.kind().name(),
						sent.cancellation().venueName(), sent.cancellation().bookingDate(), null, null, null, null, null));
				case BOOKING_CONFIRMATION -> Optional.of(new BookingMailView(sent.kind().name(),
						sent.confirmation().venueName(), sent.confirmation().bookingDate(), null, null, null, null, null));
				case EMAIL_VERIFICATION, PASSWORD_RESET, PAYMENT_DUE, OPERATOR_APPROVED, REQUEST_DECLINED,
						REQUEST_EXPIRED -> Optional.empty();
			};
		}
	}
}
