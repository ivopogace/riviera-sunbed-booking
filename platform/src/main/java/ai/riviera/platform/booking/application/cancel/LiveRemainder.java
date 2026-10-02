package ai.riviera.platform.booking.application.cancel;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.domain.BookingTransition;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The one place that says which stretches of a stay a guest cancel reaches (ADR-0024 §4 as amended, #1290):
 * a stretch a remodel commit already ended (a receipt outcome line, whatever its kind) is set aside, every
 * other stretch is the <em>live remainder</em>, judged on its first day. Any other ending (a weather refund,
 * a concurrent writer) is not set aside, so the stay still refuses whole. Port-backed, so it lives in
 * {@code application} (ADR-0018 §2); {@code public} for the {@code view} slice, which quotes the same way (#10).
 */
@Component
public class LiveRemainder {

	private final RemodelReceipts receipts;

	public LiveRemainder(RemodelReceipts receipts) {
		this.receipts = receipts;
	}

	/** Splits a stay's stretches, in day order, into the live remainder and the ones set aside. */
	public Split of(List<BookingRecord> stretches) {
		return new Split(stretches.stream().filter(stretch -> !setAside(stretch)).toList(),
				stretches.stream().filter(this::setAside).toList());
	}

	/** Whether a guest cancel sets this stretch aside: ended, and by a remodel commit's outcome line. */
	private boolean setAside(BookingRecord stretch) {
		return !BookingTransition.CANCEL_BY_GUEST.admits(stretch.status())
				&& receipts.endedByRemodel(new BookingId(stretch.id()));
	}

	/** A stay's stretches as the guest cancel sees them; {@code setAside} is never quoted, transitioned or announced. */
	public record Split(List<BookingRecord> live, List<BookingRecord> setAside) {

		public Split {
			live = List.copyOf(live);
			setAside = List.copyOf(setAside);
		}

		/** The day the remainder is judged on: the first live stretch's first day; empty when nothing is live. */
		public Optional<LocalDate> firstLiveDay() {
			return live.isEmpty() ? Optional.empty() : Optional.of(live.getFirst().bookingDate());
		}
	}
}
