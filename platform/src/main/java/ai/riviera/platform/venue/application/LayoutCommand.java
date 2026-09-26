package ai.riviera.platform.venue.application;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * The validated intent to replace a venue's whole beach-map layout in one bulk PUT. Each
 * {@link SetCommand} validated itself; this adds the whole-layout rules: non-empty, at most
 * {@link #MAX_SETS}, no two sets on one grid cell or row+position, no row label spanning two grid
 * rows. It persists exactly what the client built; generate-time defaults (row A premium) are the
 * frontend's. The list is defensively copied and unmodifiable.
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
				.map(cell -> new SetCommand(cell.rowLabel(), cell.positionNo(), cell.tier(), cell.pool(),
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

	/**
	 * Whether one {@code rowLabel} spans two {@code gridY} rows, which label-grouping surfaces
	 * would merge. The batch twin of {@code ROW_NAME_TAKEN}; not a {@link Venues.Conflict} as no DB
	 * constraint sees it (gap-cell numbering keeps each {@code (row_label, position_no)} unique).
	 */
	boolean splitsRowLabel() {
		Map<String, Integer> rowOf = new HashMap<>();
		for (SetCommand c : sets) {
			Integer first = rowOf.putIfAbsent(c.rowLabel(), c.gridY());
			if (first != null && first != c.gridY()) {
				return true;
			}
		}
		return false;
	}
}
