package ai.riviera.platform.venue.vocabulary;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * The fixed platform beach catalogue — every named beach on the Albanian coast, each in its
 * {@link Region}; a venue sits on exactly one, its region derived, never stored. Wire value is the
 * enum name; labels and camera views are the frontend mirror's ({@code shared/beaches.ts}).
 *
 * <p><strong>Declaration order IS the canonical display order</strong> (north to south). Keep the
 * names in lockstep with {@code venue_beach_catalogue_check}: add a beach there in the same
 * migration, or every read of a row carrying it fails.
 */
public enum Beach {
	VELIPOJE(Region.SHKODER),
	SHENGJIN(Region.LEZHE),
	TALE(Region.LEZHE),
	PATOK(Region.LEZHE),
	LALEZ(Region.DURRES),
	CURRILA(Region.DURRES),
	DURRES(Region.DURRES),
	SHKEMBI_I_KAVAJES(Region.DURRES),
	GOLEM(Region.DURRES),
	QERRET(Region.DURRES),
	SPILLE(Region.DURRES),
	DIVJAKE(Region.FIER),
	SEMAN(Region.FIER),
	DAREZEZE(Region.FIER),
	ZVERNEC(Region.VLORE),
	VLORE(Region.VLORE),
	RADHIME(Region.VLORE),
	ORIKUM(Region.VLORE),
	PALASE(Region.HIMARE),
	DRYMADES(Region.HIMARE),
	DHERMI(Region.HIMARE),
	GJIPE(Region.HIMARE),
	JALE(Region.HIMARE),
	LIVADHI(Region.HIMARE),
	HIMARE(Region.HIMARE),
	POTAM(Region.HIMARE),
	LLAMANI(Region.HIMARE),
	QEPARO(Region.HIMARE),
	BORSH(Region.HIMARE),
	LUKOVE(Region.HIMARE),
	BUNEC(Region.HIMARE),
	KAKOME(Region.HIMARE),
	SARANDE(Region.SARANDE),
	PASQYRA(Region.SARANDE),
	PULEBARDHA(Region.SARANDE),
	KSAMIL(Region.SARANDE);

	/** The coastal areas the catalogue groups by, north to south — the tourist's Region filter. */
	public enum Region {
		SHKODER, LEZHE, DURRES, FIER, VLORE, HIMARE, SARANDE;

		/** The catalogue's beaches in this region, in catalogue order. */
		public List<Beach> beaches() {
			return Arrays.stream(Beach.values()).filter(b -> b.region == this).toList();
		}

		/** The region for a wire code, empty for anything off the catalogue (never an exception). */
		public static Optional<Region> fromCode(String code) {
			return Arrays.stream(values()).filter(r -> r.name().equals(code)).findFirst();
		}
	}

	private final Region region;

	Beach(Region region) {
		this.region = region;
	}

	public Region region() {
		return region;
	}

	/** The beach for a wire code, empty for anything off the catalogue (never an exception). */
	public static Optional<Beach> fromCode(String code) {
		return Arrays.stream(values()).filter(b -> b.name().equals(code)).findFirst();
	}
}
