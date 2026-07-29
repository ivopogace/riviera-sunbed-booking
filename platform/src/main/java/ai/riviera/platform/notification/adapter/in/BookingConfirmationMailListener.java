package ai.riviera.platform.notification.adapter.in;

import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

import ai.riviera.platform.booking.api.BookingNotificationFacts;
import ai.riviera.platform.booking.events.BookingConfirmed;
import ai.riviera.platform.booking.vocabulary.BookingNotificationInfo;
import ai.riviera.platform.customer.api.CustomerLookup;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.notification.application.BookingConfirmationMail;
import ai.riviera.platform.notification.application.TransactionalMailService;
import ai.riviera.platform.venue.api.SetBookingFacts;
import ai.riviera.platform.venue.vocabulary.SetBookingInfo;

/**
 * Mails the tourist their booking code when a booking is confirmed (#371, epic #367 story 1) — the
 * design spec's promised "booking code plus an email", which until #371 lived only in a browser tab.
 *
 * <p>The {@code notification} module's driving adapter for the registry vehicle (#382; until then
 * this listener sat at the platform edge — the move is why the module's {@code allowedDependencies}
 * read like a fan-in). It assembles one message from three owners' published ports: {@code booking}
 * supplies the arrival code + contact id, {@code venue} the venue name + set label, {@code customer}
 * the address. Nothing is re-derived that the event already carries: the date, amount and currency
 * are immutable facts of the confirmation and ride the payload. Delivery goes through
 * {@link TransactionalMailService} — the chokepoint — never the transport directly.
 *
 * <p><strong>Asynchronous and after-commit</strong>, so a mail failure can never roll back a booking.
 * This was an {@code @ApplicationModuleListener} until #383; it is now that annotation's own expansion
 * — {@code @Async} + {@code @TransactionalEventListener}, whose default phase is
 * {@code AFTER_COMMIT} — written out, because the composite takes no executor qualifier and its bare
 * {@code @Async} means Boot's shared {@code applicationTaskExecutor}: the pool that also carries the
 * payment→booking confirmation (invariant #8) and the booking→payout accrual (invariant #9). Under the
 * {@code mailer} profile that put a blocking SMTP round-trip on the money path once per confirmed
 * booking. {@link RegistryMailExecutorConfig} argues the dedicated pool; {@code RegistryMailBulkheadIT}
 * proves the spine stays responsive while this transport hangs.
 *
 * <p><strong>The third annotation, {@code @Transactional(REQUIRES_NEW)}, is deliberately not restored.</strong>
 * The three port reads below are independent read-only queries with nothing to keep consistent between
 * them — the event is delivered after the producer committed, so each already sees settled state. What
 * a transaction did add was a Hikari connection held for the whole method, SMTP round-trip included.
 * That is a second, independent hazard, not the one that reproduced: the pre-fix
 * {@code RegistryMailBulkheadIT} failed by <strong>starving the shared pool of threads</strong> — the
 * invariant-#8 confirmation timed out behind ten wedged sends — never by exhausting the connection
 * pool, which stock sizing puts out of reach anyway (8 core executor threads against 10 connections).
 * Dropping the transaction is worth doing on its own terms, and
 * {@code RegistryMailBulkheadIT#sendsWithNoTransactionHeldOpen} asserts the connection is unbound and
 * not merely the transaction inactive — {@code NOT_SUPPORTED} would satisfy the weaker check while
 * still pinning the connection. Registry tracking is unaffected either way — it keys on
 * {@code @TransactionalEventListener}, not on the transaction — and that too is asserted, not assumed.
 *
 * <p>The class, method name and parameter type are all unchanged, so the registry's {@code listener_id}
 * (which embeds exactly those, and which republication matches string-equal) still reads as V31 (#382)
 * migrated it — no Flyway rewrite, pinned by {@code RegistryMailBulkheadIT#keepsTheListenerIdV31Migrated}.
 *
 * <p>The Event Publication Registry is the <em>whole</em> idempotency story:
 * it marks a publication complete only after this method returns, and
 * {@code republish-outstanding-events-on-restart} resubmits only publications with a NULL
 * {@code completion_date}. There is deliberately no dedupe table — one written inside this
 * transaction would share the identical crash window (send succeeds, process dies, row rolls back),
 * so it would buy nothing. The accepted guarantee is therefore <strong>at-least-once</strong>; the
 * operational lever for the opposite failure ("completed, but the inbox is empty") is the admin
 * resend in #380, not a restart.
 *
 * <p>A missing booking, set or contact is logged and skipped rather than thrown: none of them can
 * appear later, so retrying would only park a permanently-failing publication in the outbox. A
 * transport failure, by contrast, propagates on purpose — that publication stays outstanding and is
 * retried. Nothing here logs the arrival code (invariant #7).
 */
@Component
class BookingConfirmationMailListener {

	private static final Logger log = LoggerFactory.getLogger(BookingConfirmationMailListener.class);

	private final BookingNotificationFacts bookings;
	private final SetBookingFacts sets;
	private final CustomerLookup customers;
	private final TransactionalMailService mails;

	BookingConfirmationMailListener(BookingNotificationFacts bookings, SetBookingFacts sets,
			CustomerLookup customers, TransactionalMailService mails) {
		this.bookings = bookings;
		this.sets = sets;
		this.customers = customers;
		this.mails = mails;
	}

	@Async(RegistryMailExecutorConfig.MAIL_EXECUTOR)
	@TransactionalEventListener
	void on(BookingConfirmed event) {
		long bookingId = event.bookingId().value();

		Optional<BookingNotificationInfo> booking = bookings.notificationInfo(event.bookingId());
		if (booking.isEmpty()) {
			log.warn("no booking {} — skipping confirmation mail", bookingId);
			return;
		}
		Optional<SetBookingInfo> set = sets.setBookingInfo(event.setId());
		if (set.isEmpty()) {
			log.warn("no set {} — skipping confirmation mail for booking {}",
					event.setId().value(), bookingId);
			return;
		}
		Optional<GuestContact> contact = customers.findById(booking.get().customerId());
		if (contact.isEmpty()) {
			log.warn("no contact for booking {} — skipping confirmation mail", bookingId);
			return;
		}

		mails.sendBookingConfirmation(contact.get().email(), new BookingConfirmationMail(
				booking.get().code(), set.get().venueName(), event.bookingDate(),
				set.get().rowLabel(), set.get().positionNo(), event.amountMinor(), event.currency()));
	}
}
