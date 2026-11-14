package ai.riviera.platform.notification.adapter.in;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import ai.riviera.platform.notification.application.SupportContact;

/**
 * The anonymous read behind the SPA's help page, booking view and console account menu: the configured
 * support channels ({@code null} where none is configured) and whether today, in {@code Europe/Tirane}
 * (invariant #6), carries the same-day promise. Configuration only, no principal and no id.
 */
@RestController
class SupportContactController {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");

	private final SupportContact contact;
	private final Clock clock;

	SupportContactController(SupportContact contact, Clock clock) {
		this.contact = contact;
		this.clock = clock;
	}

	/**
	 * @param email the support mailbox, or {@code null}
	 * @param whatsapp the WhatsApp channel, or {@code null}
	 * @param sameDayReply whether the help page may promise a same-day answer today
	 */
	record SupportContactResponse(String email, WhatsappChannel whatsapp, boolean sameDayReply) {
	}

	/**
	 * @param number the number as dialled, {@code +<digits>}
	 * @param url its {@code https://wa.me/<digits>} chat link
	 */
	record WhatsappChannel(String number, String url) {
	}

	@GetMapping("/api/support-contact")
	SupportContactResponse supportContact() {
		WhatsappChannel whatsapp = contact.whatsappNumber()
				.flatMap(number -> contact.whatsappLink().map(link -> new WhatsappChannel(number, link.toString())))
				.orElse(null);
		return new SupportContactResponse(contact.email().orElse(null), whatsapp,
				SupportContact.answersSameDayOn(LocalDate.now(clock.withZone(TIRANE))));
	}
}
