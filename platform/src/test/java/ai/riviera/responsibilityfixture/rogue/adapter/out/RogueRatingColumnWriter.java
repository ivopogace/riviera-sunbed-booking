package ai.riviera.responsibilityfixture.rogue.adapter.out;

/**
 * A would-be second writer of {@code venue.rating_tenths} / {@code reviews_count} from
 * outside the {@code venue} module — the boundary {@code RESPONSIBILITIES.md} §venue states
 * ("I store the rating aggregate; {@code review} computes it") and
 * {@code ResponsibilitiesArchitectureTests}' rating-columns rule must reject. The column
 * names in this text block land in the constant pool, which is what the scan keys on.
 */
final class RogueRatingColumnWriter {

	static final String OVERWRITE_SQL = """
			UPDATE venue
			SET rating_tenths = :tenths, reviews_count = :count
			WHERE id = :id
			""";

	private RogueRatingColumnWriter() {
	}
}
