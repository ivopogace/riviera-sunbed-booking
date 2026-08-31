package ai.riviera.platform.booking.application.request;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.platform.EnabledIfDockerAvailable;
import ai.riviera.platform.TestcontainersConfiguration;
import ai.riviera.platform.booking.events.BookingPaymentDue;
import ai.riviera.platform.booking.vocabulary.BookingId;
import ai.riviera.platform.booking.vocabulary.CancellationWindow;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.VenueId;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * That {@link PaymentDueAnnouncer} actually opens a transaction — the one property the rest of the slice
 * silently depends on, and the one no other test in the slice touches.
 *
 * <p><strong>Why it needs its own IT.</strong> {@code RespondToRequestServiceTest} constructs the
 * announcer directly, so there is no proxy and no transaction to observe;
 * {@code RequestPaymentDueMailIT} publishes through its own {@code TransactionTemplate}, so it
 * exercises the listener without ever going through this seam. Between them the announcer's
 * {@code @Transactional} is never executed under Spring — and if it silently did nothing, every
 * assertion in both files would still pass while production sent no mail at all: with no transaction
 * there is no commit for {@code @TransactionalEventListener} to fire after (its
 * {@code fallbackExecution} is false, so the event is simply dropped) and no
 * {@code event_publication} row for the restart republish or the re-drive to find.
 *
 * <p><strong>The review round is why the method is public and this test still exists.</strong>
 * Spring's {@code AnnotationTransactionAttributeSource} is <em>public-methods-only</em> by default, so
 * a package-private {@code @Transactional} — the shape this started as, matching every other
 * collaborator behind the {@link RespondToRequest} seam — rests on proxying behaviour that is not the
 * documented contract. It applied in practice (this test passed before the visibility changed), but
 * {@code RequestReleaseService}'s convention makes the method public so nothing depends on that. The
 * assertion stays behavioural for the same reason it was written: a persisted publication row is proof
 * a real transaction committed, which no amount of reading the annotation — or the modifier — can
 * establish, and it is what would catch a future Spring version tightening the rule again.
 *
 * <p>The event names a booking id nothing resolves, on purpose. What is under test is the
 * <em>publication</em>, not the send; the listener will abandon and complete the row, which is why
 * the assertion reads both the live and the archive table.
 *
 * <p>Testcontainers; skipped where Docker is absent.
 */
@EnabledIfDockerAvailable
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class PaymentDueAnnouncerIT {

	/** Improbable, and this class's alone — the publication is matched on it (BookingMailFixtures' rule). */
	private static final long AMOUNT_MINOR = 6_190_237L;

	@Autowired
	PaymentDueAnnouncer announcer;

	@Autowired
	JdbcClient jdbc;

	@Test
	void announcingPersistsAnEventPublication() {
		announcer.announce(new BookingPaymentDue(new BookingId(876_543_210L), new VenueId(1),
				new SetId(1), LocalDate.of(2029, 9, 9),
				Instant.now().plus(Duration.ofHours(12)).truncatedTo(ChronoUnit.MILLIS),
				AMOUNT_MINOR, "EUR", CancellationWindow.CLOSED, 0));

		assertThat(publicationsForThisEvent())
				.as("no row means @Transactional did not apply, so the after-commit listener never ran "
						+ "and nothing is left for the restart republish or the #405 re-drive")
				.isPositive();
	}

	/** Live plus archive: a completed publication is moved out the moment the listener returns. */
	private long publicationsForThisEvent() {
		return jdbc.sql("""
				SELECT (SELECT COUNT(*) FROM event_publication
				        WHERE listener_id LIKE :listener AND serialized_event LIKE :amount)
				     + (SELECT COUNT(*) FROM event_publication_archive
				        WHERE listener_id LIKE :listener AND serialized_event LIKE :amount)
				""")
				.param("listener", "%RequestPaymentDueMailListener%")
				.param("amount", "%" + AMOUNT_MINOR + "%")
				.query(Long.class).single();
	}
}
