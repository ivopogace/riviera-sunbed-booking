package ai.riviera.platform.venue.vocabulary;

import java.time.LocalDate;

/**
 * A set a layout write may not remove or renumber, as the refusal names it: its id and placement,
 * the earliest service day a guest may still turn up on it ({@code bookedOn}) and the earliest hold
 * from today on ({@code heldOn}) — either may be {@code null}, never both null. The published twin of
 * the save's own refusal, so the remodel commit names sets exactly as the save does.
 */
public record LockedSet(SetId setId, SetPlacement placement, LocalDate bookedOn, LocalDate heldOn) {

	public LockedSet {
		if (bookedOn == null && heldOn == null) {
			throw new IllegalArgumentException("a locked set names at least one live claim");
		}
	}
}
