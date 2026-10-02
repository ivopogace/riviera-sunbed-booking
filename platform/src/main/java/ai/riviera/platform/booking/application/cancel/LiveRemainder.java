package ai.riviera.platform.booking.application.cancel;

import java.time.LocalDate;
import java.util.List;

import org.springframework.stereotype.Component;

import ai.riviera.platform.booking.application.remodel.RemodelReceipts;
import ai.riviera.platform.booking.application.view.BookingRecord;
import ai.riviera.platform.booking.application.view.StayRecord;
import ai.riviera.platform.booking.domain.BookingStatus;
import ai.riviera.platform.booking.domain.BookingTransition;
import ai.riviera.platform.booking.vocabulary.BookingId;

/**
 * The one place that says which stretches of a stay a guest cancel reaches (ADR-0024 §4 as amended, #1290): a
 * stretch a remodel commit already ended (a receipt outcome line, whatever its kind) and a confirmed stretch with
 * nothing left (every day refunded, ADR-0026 §7, #1381) are set aside; every other stretch, whatever its status, is
 * the <em>live remainder</em>, judged on the first of them. Any other ending (a weather cancel, a concurrent writer)
 * is not set aside, so the stay still refuses whole. Port-backed, so it lives in {@code application} (ADR-0018 §2);
 * {@code public} for the view, the move mail and the stay cancellation mail, which read the same split (#10).
 */
@Component
public class LiveRemainder {

	private final RemodelReceipts receipts;

	public LiveRemainder(RemodelReceipts receipts) {
		this.receipts = receipts;
	}

	/** Splits a stay's stretches as stored; a caller holding fresher, row-locked stretches passes them instead. */
	public Split of(StayRecord stay) {
		return of(stay.stretches(), stay.firstDay());
	}

	/** Splits {@code stretches}, in day order, into the live remainder and the ones set aside. */
	public Split of(List<BookingRecord> stretches, LocalDate stayFirstDay) {
		return new Split(stretches.stream().filter(stretch -> !setAside(stretch)).toList(),
				stretches.stream().filter(this::setAside).toList(), stayFirstDay);
	}

	/** Whether a guest cancel sets this stretch aside: ended by a remodel commit's outcome line, or confirmed with nothing left. */
	private boolean setAside(BookingRecord stretch) {
		if (stretch.status() == BookingStatus.CONFIRMED) {
			return stretch.everyDayRefunded();
		}
		return !BookingTransition.CANCEL_BY_GUEST.admits(stretch.status())
				&& receipts.endedByRemodel(new BookingId(stretch.id()));
	}

	/** A stay's stretches as the guest cancel sees them: the cancel never quotes, transitions or announces {@code setAside}. */
	public record Split(List<BookingRecord> live, List<BookingRecord> setAside, LocalDate stayFirstDay) {

		public Split {
			live = List.copyOf(live);
			setAside = List.copyOf(setAside);
		}

		/** The day the stay's cancel is judged on: the first live stretch's first day, or the stay's when nothing is live. */
		public LocalDate windowDay() {
			return live.isEmpty() ? stayFirstDay : live.getFirst().bookingDate();
		}

		/**
		 * The stay has nothing left (ADR-0026 §7): nothing live while a set-aside stretch still stands confirmed, or every
		 * live stretch with every day refunded (a missed stretch whose days were washed out). A remodel-ended stay is not.
		 */
		public boolean nothingLeft() {
			if (live.isEmpty()) {
				return setAside.stream().anyMatch(stretch -> stretch.status() == BookingStatus.CONFIRMED);
			}
			return live.stream().allMatch(BookingRecord::everyDayRefunded);
		}
	}
}
