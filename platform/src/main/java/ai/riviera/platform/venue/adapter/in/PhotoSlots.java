package ai.riviera.platform.venue.adapter.in;

import java.util.Locale;

import ai.riviera.platform.shared.InvalidApiRequestException;
import ai.riviera.platform.venue.vocabulary.PhotoSlot;

/**
 * Maps the lower-case REST slot segment to {@link PhotoSlot} for the two photo controllers — the
 * operator's venue-scoped writes and the platform admin's takedown (#504). Shared rather than
 * duplicated so both surfaces answer an unknown slot identically: {@code 400 INVALID_REQUEST} from
 * the one advice, never an enum-parse {@code 500}.
 */
final class PhotoSlots {

	private PhotoSlots() {
	}

	static PhotoSlot parse(String slot) {
		return InvalidApiRequestException.parsing(() -> PhotoSlot.valueOf(slot.toUpperCase(Locale.ROOT)));
	}
}
