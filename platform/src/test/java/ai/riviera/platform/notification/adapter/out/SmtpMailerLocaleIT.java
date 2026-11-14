package ai.riviera.platform.notification.adapter.out;

import java.net.URI;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.RegisterExtension;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import com.icegreen.greenmail.junit5.GreenMailExtension;
import com.icegreen.greenmail.util.ServerSetupTest;

import jakarta.mail.internet.MimeMessage;

import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.booking.vocabulary.DeclineReason;
import ai.riviera.platform.booking.vocabulary.RefundReason;
import ai.riviera.platform.notification.application.BookingCancellationMail;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.BookingMovedMail;
import ai.riviera.platform.notification.application.DayRefundMail;
import ai.riviera.platform.notification.application.MoveReminderMail;
import ai.riviera.platform.notification.application.PaymentDueMail;
import ai.riviera.platform.notification.application.RequestDeclinedMail;
import ai.riviera.platform.notification.application.RequestExpiredMail;
import ai.riviera.platform.notification.application.StayConfirmationMail;
import ai.riviera.platform.notification.application.SupportContact;
import ai.riviera.platform.shared.SiteLocale;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every guest mail kind in every translated {@link SiteLocale} (#1770): the subject in that language, a body
 * line only that language's copy has, its month names and amount format, and no English row label, bundle key or
 * unfilled placeholder left behind. English stays pinned by {@code SmtpMailerIT}. GreenMail in the JVM, no Docker.
 */
class SmtpMailerLocaleIT {

	private static final String TO = "tourist@example.com";
	private static final String CODE = "XK4T9PQ2";
	private static final String VENUE = "Miramar Beach";
	private static final LocalDate DAY = LocalDate.of(2026, 8, 15);
	private static final LocalDate LAST = LocalDate.of(2026, 8, 17);
	private static final URI LINK = URI.create("https://app.example/sq/booking/" + CODE);
	private static final URI TOKEN_LINK = URI.create("https://app.example/sq/account/verify?token=t0ken");
	private static final Instant DEADLINE = Instant.parse("2026-08-14T18:30:00Z");

	/** English text a translated body must not carry: the row labels and fixed sentences. */
	private static final List<String> ENGLISH = List.of("Booking code:", "Venue:", "Paid:", "Refund:", "position ",
			"Your booking", "your booking", "nothing was charged", "Need help", " day", "August");

	@RegisterExtension
	static GreenMailExtension greenMail = new GreenMailExtension(ServerSetupTest.SMTP);

	static Stream<Arguments> kinds() {
		return Stream.of(
				kind("verification", (m, l) -> m.sendEmailVerification(TO, l, TOKEN_LINK),
						"Verifikoni adresën tuaj të e-mailit", "Conferma il tuo indirizzo e-mail",
						"duke hapur këtë lidhje", "aprendo questo link"),
				kind("reset", (m, l) -> m.sendPasswordReset(TO, l, TOKEN_LINK),
						"Rivendosni fjalëkalimin", "Reimposta la password",
						"fjalëkalimi juaj mbetet i pandryshuar", "la tua password resta invariata"),
				kind("confirmation", (m, l) -> m.sendBookingConfirmation(TO, l, new BookingConfirmationMail(CODE, VENUE,
								DAY, DAY, "A", 3, 2500, "EUR", CancellationWindow.LATE, 2250)),
						"Rezervimi juaj te Miramar Beach u konfirmua", "La tua prenotazione presso Miramar Beach è confermata",
						"rimbursohet vetëm 22,5% e çmimit", "solo il 22,5% del prezzo"),
				kind("stay confirmation", (m, l) -> m.sendStayConfirmation(TO, l, new StayConfirmationMail(CODE, VENUE,
								DAY, LAST, List.of(new StayConfirmationMail.Stop(DAY, DAY.plusDays(1), "A", 3),
										new StayConfirmationMail.Stop(LAST, LAST, "B", 5)), 7500, "EUR",
								CancellationWindow.CLOSED, 0)),
						"Qëndrimi juaj te Miramar Beach u konfirmua", "Il tuo soggiorno presso Miramar Beach è confermato",
						"(3 ditë)", "(3 giorni)"),
				kind("cancellation", (m, l) -> m.sendBookingCancellation(TO, l, new BookingCancellationMail(CODE, VENUE,
								DAY, DAY, 2500, "EUR", RefundReason.VENUE_CHANGE, URI.create("https://app.example/sq/?date=2026-08-15"))),
						"Rezervimi juaj te Miramar Beach u anulua", "La tua prenotazione presso Miramar Beach è cancellata",
						"Rezervoni një vend tjetër për të njëjtën ditë:", "Prenota un altro posto per lo stesso giorno:"),
				kind("payment due", (m, l) -> m.sendPaymentDue(TO, l, new PaymentDueMail(CODE, VENUE, DAY, DAY, DEADLINE,
								2500, "EUR", LINK, CancellationWindow.FREE, 0)),
						"Miramar Beach e pranoi kërkesën tuaj — duhet të paguani",
						"Miramar Beach ha accettato la tua richiesta — pagamento dovuto",
						"14 gusht 2026 në orën 20:30", "14 agosto 2026 alle 20:30"),
				kind("moved", (m, l) -> m.sendBookingMoved(TO, l, new BookingMovedMail(CODE, VENUE, DAY, DAY, "A", 3, "B",
								5, 1, 2, DEADLINE, false, LINK)),
						"Vendi juaj te Miramar Beach ka ndryshuar", "Il tuo posto presso Miramar Beach è cambiato",
						"1 rresht dhe 2 pozicione më tej", "1 fila e 2 posizioni più in là"),
				kind("move reminder", (m, l) -> m.sendMoveReminder(TO, l, new MoveReminderMail(CODE, VENUE, DAY, LAST,
								"A", 3, "B", 5, 0, 1, LINK, true)),
						"Nesër te Miramar Beach: vendi juaj ndryshon", "Domani presso Miramar Beach: il tuo posto cambia",
						"1 pozicion përgjatë rreshtit", "1 posizione lungo la fila"),
				kind("day refund", (m, l) -> m.sendDayRefund(TO, l, new DayRefundMail(CODE, VENUE, DAY, 2500, "EUR",
								RefundReason.WEATHER, false, LINK)),
						"Një ditë e rezervimit tuaj te Miramar Beach u rimbursua",
						"Un giorno della tua prenotazione presso Miramar Beach è rimborsato",
						"vendi mbetet i juaji", "il tuo posto resta tuo"),
				kind("request declined", (m, l) -> m.sendRequestDeclined(TO, l, new RequestDeclinedMail(CODE, VENUE, DAY,
								LAST, LINK, DeclineReason.SET_UNAVAILABLE)),
						"Miramar Beach e refuzoi kërkesën tuaj për rezervim",
						"Miramar Beach ha rifiutato la tua richiesta di prenotazione",
						"nuk është më i lirë për ato ditë", "non è più disponibile per quei giorni"),
				kind("request expired", (m, l) -> m.sendRequestExpired(TO, l, new RequestExpiredMail(CODE, VENUE, DAY, DAY,
								LINK)),
						"Kërkesa juaj për rezervim te Miramar Beach skadoi",
						"La tua richiesta di prenotazione a Miramar Beach è scaduta",
						"skadoi pa marrë përgjigje nga lokali", "scaduta senza una risposta dallo stabilimento"));
	}

	@ParameterizedTest(name = "{0} in {1}")
	@MethodSource("translated")
	void eachMailKindIsWrittenInTheGuestsLanguage(String kind, SiteLocale locale, BiConsumer<SmtpMailer, SiteLocale> send,
			Map<SiteLocale, String> subject, Map<SiteLocale, String> phrase) throws Exception {
		send.accept(mailer(SupportContact.NONE), locale);

		MimeMessage message = theOnlyReceivedMessage();
		String body = normalized(message);
		assertThat(message.getSubject()).isEqualTo(subject.get(locale));
		assertThat(body).contains(phrase.get(locale)).doesNotContain("{", "}", "row.", "value.");
		assertThat(body).as("no English copy in a %s mail", locale.code()).doesNotContain(ENGLISH);
	}

	static Stream<Arguments> translated() {
		return kinds().flatMap(kind -> Stream.of(SiteLocale.SQ, SiteLocale.IT).map(locale -> {
			Object[] row = kind.get();
			return Arguments.of(row[0], locale, row[1], row[2], row[3]);
		}));
	}

	@Test
	void aTranslatedBlockAlignsItsOwnLabelsAndTheSupportChannelsFollowTheLocale() throws Exception {
		mailer(new SupportContact("help@example.com", "355691234567")).sendBookingConfirmation(TO, SiteLocale.IT,
				new BookingConfirmationMail(CODE, VENUE, DAY, LAST, "A", 3, 7500, "EUR", CancellationWindow.FREE, 0));

		assertThat(normalized(theOnlyReceivedMessage())).isEqualTo("""
				Il tuo set di lettini è confermato.

				  Codice di prenotazione:  XK4T9PQ2
				  Stabilimento:            Miramar Beach
				  Giorni:                  15 agosto – 17 agosto 2026 (3 giorni)
				  Posto:                   A, posizione 3
				  Pagato:                  75,00 EUR

				Mostra il codice di prenotazione allo stabilimento al tuo arrivo.

				Hai bisogno di aiuto? Contatta Riviera:
				  E-mail:    help@example.com
				  WhatsApp:  +355691234567 (https://wa.me/355691234567)""");
	}

	private static Arguments kind(String name, BiConsumer<SmtpMailer, SiteLocale> send, String sqSubject,
			String itSubject, String sqPhrase, String itPhrase) {
		return Arguments.of(name, send, Map.of(SiteLocale.SQ, sqSubject, SiteLocale.IT, itSubject),
				Map.of(SiteLocale.SQ, sqPhrase, SiteLocale.IT, itPhrase));
	}

	private static SmtpMailer mailer(SupportContact support) {
		JavaMailSenderImpl sender = new JavaMailSenderImpl();
		sender.setHost("127.0.0.1");
		sender.setPort(greenMail.getSmtp().getPort());
		sender.setDefaultEncoding("UTF-8");
		return new SmtpMailer(sender, "noreply@test.local", support);
	}

	private static String normalized(MimeMessage message) throws Exception {
		return message.getContent().toString().replace("\r\n", "\n");
	}

	private static MimeMessage theOnlyReceivedMessage() {
		MimeMessage[] received = greenMail.getReceivedMessages();
		assertThat(received).hasSize(1);
		return received[0];
	}
}
