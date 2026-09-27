package ai.riviera.platform.booking.application.reserve;

import java.time.LocalDate;
import java.util.List;

import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.GuestContact;
import ai.riviera.platform.venue.vocabulary.SetId;
import ai.riviera.platform.venue.vocabulary.StaySpan;

/**
 * Book a stitched stay (design D6): at least two same-set stretches that together cover a contiguous
 * span, consecutive stretches on different sets. The shape is validated here; whether the sets
 * exist, sell online and are free is the reserve's answer. {@code accountId} is null for a guest.
 */
public record CreateStayCommand(List<Stretch> stretches, GuestContact contact, CustomerAccountId accountId) {

	/** One same-set run, first to last day inclusive. */
	public record Stretch(SetId setId, LocalDate firstDay, LocalDate lastDay) {

		public Stretch {
			new StaySpan(firstDay, lastDay);
		}

		public StaySpan span() {
			return new StaySpan(firstDay, lastDay);
		}
	}

	public CreateStayCommand {
		stretches = List.copyOf(stretches);
		if (stretches.size() < 2) {
			throw new IllegalArgumentException("a stay is at least two stretches; one stretch is a booking");
		}
		for (int i = 1; i < stretches.size(); i++) {
			Stretch previous = stretches.get(i - 1);
			Stretch next = stretches.get(i);
			if (!next.firstDay().equals(previous.lastDay().plusDays(1))) {
				throw new IllegalArgumentException("stretches must be contiguous: " + next.firstDay()
						+ " does not follow " + previous.lastDay());
			}
			if (next.setId().equals(previous.setId())) {
				throw new IllegalArgumentException("consecutive stretches must be on different sets");
			}
		}
		new StaySpan(stretches.getFirst().firstDay(), stretches.getLast().lastDay());
	}

	/** The whole stay, first day of the first stretch to last day of the last. */
	public StaySpan stay() {
		return new StaySpan(stretches.getFirst().firstDay(), stretches.getLast().lastDay());
	}
}
