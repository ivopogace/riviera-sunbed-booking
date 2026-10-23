package ai.riviera.platform.venue.application;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * The validated intent to replace a venue's whole beach-map layout in one bulk PUT. Each
 * {@link SetCommand} validated itself; this adds the whole-layout rules: non-empty, at most
 * {@link #MAX_SETS}, no two sets on one grid cell or row+position. It persists what the client built,
 * each row labelled by its grid letter; generate-time defaults (row A premium) are the frontend's. The
 * list is defensively copied and unmodifiable.
 */
public record LayoutCommand(List<SetCommand> sets) {

	/** The maximum layout size: the design caps generation at 26 rows × 40 positions. */
	public static final int MAX_SETS = 26 * 40;

	public LayoutCommand {
		sets = List.copyOf(sets); // defensive copy + null-hostile
	}

	/** The remodel commit's cells as the save's commands; each {@link SetCommand} re-validates its cell. */
	public static LayoutCommand of(List<ai.riviera.platform.venue.vocabulary.LayoutCell> cells) {
		return new LayoutCommand(cells.stream()
				.map(cell -> new SetCommand(cell.positionNo(), cell.tier(), cell.pool(),
						cell.priceMinor(), cell.priceCurrency(), cell.gridX(), cell.gridY()))
				.toList());
	}

	boolean isEmpty() {
		return sets.isEmpty();
	}

	boolean tooLarge() {
		return sets.size() > MAX_SETS;
	}

	/**
	 * The first layout-uniqueness conflict within the batch, position clashes before cell clashes
	 * (as {@code JdbcVenues.findConflict}): a precise rejection ahead of the DB UNIQUE backstop.
	 */
	Optional<Venues.Conflict> duplicateWithin() {
		Set<String> positions = new HashSet<>();
		Set<String> cells = new HashSet<>();
		for (SetCommand c : sets) {
			if (!positions.add(c.rowLabel() + ' ' + c.positionNo())) {
				return Optional.of(Venues.Conflict.DUPLICATE_POSITION);
			}
		}
		for (SetCommand c : sets) {
			if (!cells.add(c.gridX() + " " + c.gridY())) {
				return Optional.of(Venues.Conflict.CELL_TAKEN);
			}
		}
		return Optional.empty();
	}
}
