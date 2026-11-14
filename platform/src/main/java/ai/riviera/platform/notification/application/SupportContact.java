package ai.riviera.platform.notification.application;

import java.net.URI;
import java.time.LocalDate;
import java.time.Month;
import java.util.Optional;

/**
 * The platform's support channels, the one source the mails and the SPA's help surfaces read: a
 * mailbox and a WhatsApp number, each absent until configured, and an absent channel is rendered
 * nowhere. Values arrive already shape-checked by their binding ({@code SupportContactProperties}).
 * Rationale: {@code RESPONSIBILITIES.md} §notification.
 */
public final class SupportContact {

	/** No channel configured: every surface renders no contact at all. */
	public static final SupportContact NONE = new SupportContact(null, null);

	/** The owner's season for the same-day answer (issue #1735), inclusive at both ends. */
	private static final Month SEASON_FIRST = Month.MAY;
	private static final Month SEASON_LAST = Month.OCTOBER;

	private static final String WHATSAPP_LINK_PREFIX = "https://wa.me/";

	private final String email;
	private final String whatsappDigits;

	/**
	 * @param email the support mailbox, or {@code null} when none is configured
	 * @param whatsappDigits the WhatsApp number as E.164 digits without the {@code +}, or {@code null}
	 */
	public SupportContact(String email, String whatsappDigits) {
		this.email = email;
		this.whatsappDigits = whatsappDigits;
	}

	public Optional<String> email() {
		return Optional.ofNullable(email);
	}

	/** The number as a guest dials it, {@code +<digits>}. */
	public Optional<String> whatsappNumber() {
		return Optional.ofNullable(whatsappDigits).map(digits -> "+" + digits);
	}

	/** The plain {@code https://wa.me/<digits>} chat link: no embed, no third-party script. */
	public Optional<URI> whatsappLink() {
		return Optional.ofNullable(whatsappDigits).map(digits -> URI.create(WHATSAPP_LINK_PREFIX + digits));
	}

	public boolean hasChannel() {
		return email != null || whatsappDigits != null;
	}

	/** Whether {@code day}, a {@code Europe/Tirane} date (invariant #6), is in the same-day-answer season. */
	public static boolean answersSameDayOn(LocalDate day) {
		Month month = day.getMonth();
		return month.compareTo(SEASON_FIRST) >= 0 && month.compareTo(SEASON_LAST) <= 0;
	}
}
