package ai.riviera.platform.notification.adapter.in;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.notification.adapter.out.MockMailer;
import ai.riviera.platform.notification.adapter.out.SentEmail;

/**
 * The recording {@link MockMailer}'s booking mails over HTTP, so a real-backend e2e run can prove
 * a mail left. Present only where the mock transport is (so never under {@code prod});
 * operator-gated. Booking kinds only, as facts a guest reads on the page anyway: never a code or
 * the code-gated link that embeds one (invariant #7), never a recovery kind. The one link that
 * rides is a cancellation's rebook link, which embeds no credential.
 */
@RestController
@RequestMapping("/api/mock-mail")
@Profile("!mailer & !smtp4dev")
class MockMailOutboxController {

	private final ObjectProvider<MockMailer> mailer;

	/** Resolved lazily: a test that swaps the {@code Mailer} bean for a double leaves no outbox to read. */
	MockMailOutboxController(ObjectProvider<MockMailer> mailer) {
		this.mailer = mailer;
	}

	@GetMapping("/booking-mails")
	List<BookingMailView> bookingMails(@RequestParam("to") String toEmail) {
		MockMailer outbox = mailer.getIfAvailable();
		if (outbox == null) {
			return List.of();
		}
		return outbox.sent().stream()
				.filter(sent -> sent.toEmail().equalsIgnoreCase(toEmail))
				.flatMap(sent -> BookingMailView.of(sent).stream())
				.toList();
	}

	/**
	 * One booking mail as recorded; {@code from}/{@code to}/{@code freeExitUntil} ride only on a move,
	 * and {@code rebookLink} only on a cancellation the venue itself caused.
	 */
	record BookingMailView(String kind, String venueName, LocalDate bookingDate, String from, String to,
			Integer rowsAway, Integer positionsAway, Instant freeExitUntil, String rebookLink) {

		static Optional<BookingMailView> of(SentEmail sent) {
			return switch (sent.kind()) {
				case BOOKING_MOVED -> Optional.of(new BookingMailView(sent.kind().name(), sent.moved().venueName(),
						sent.moved().bookingDate(), sent.moved().fromRowLabel() + sent.moved().fromPositionNo(),
						sent.moved().toRowLabel() + sent.moved().toPositionNo(), sent.moved().rowsAway(),
						sent.moved().positionsAway(), sent.moved().freeExitUntil(), null));
				case BOOKING_CANCELLATION -> Optional.of(new BookingMailView(sent.kind().name(),
						sent.cancellation().venueName(), sent.cancellation().bookingDate(), null, null, null, null, null,
						link(sent.cancellation().rebookLink())));
				case BOOKING_CONFIRMATION -> Optional.of(new BookingMailView(sent.kind().name(),
						sent.confirmation().venueName(), sent.confirmation().bookingDate(), null, null, null, null, null,
						null));
				case EMAIL_VERIFICATION, PASSWORD_RESET, PAYMENT_DUE, OPERATOR_APPROVED, REQUEST_DECLINED,
						REQUEST_EXPIRED -> Optional.empty();
			};
		}

		private static String link(URI rebookLink) {
			return rebookLink == null ? null : rebookLink.toString();
		}
	}
}
