package ai.riviera.platform.venue.vocabulary;

import java.util.Arrays;
import java.util.List;
import java.util.Optional;

/**
 * The fixed platform beach catalogue — every named beach on the Albanian coast, each in its
 * {@link Region}; a venue sits on exactly one, its region derived, never stored. Wire value is the
 * enum name; the display label is mirrored by {@code shared/beaches.ts} ({@code BeachLabelMirrorTest}).
 *
 * <p><strong>Declaration order IS the canonical display order</strong> (north to south). Keep the
 * names in lockstep with {@code venue_beach_catalogue_check}: add a beach there in the same
 * migration, or every read of a row carrying it fails.
 */
public enum Beach {
	VELIPOJE(Region.SHKODER, "Velipojë"),
	SHENGJIN(Region.LEZHE, "Shëngjin"),
	TALE(Region.LEZHE, "Tale"),
	PATOK(Region.LEZHE, "Patok"),
	LALEZ(Region.DURRES, "Lalëz"),
	CURRILA(Region.DURRES, "Currila"),
	DURRES(Region.DURRES, "Durrës"),
	SHKEMBI_I_KAVAJES(Region.DURRES, "Shkëmbi i Kavajës"),
	GOLEM(Region.DURRES, "Golem"),
	QERRET(Region.DURRES, "Qerret"),
	SPILLE(Region.DURRES, "Spille"),
	DIVJAKE(Region.FIER, "Divjakë"),
	SEMAN(Region.FIER, "Seman"),
	DAREZEZE(Region.FIER, "Darëzezë"),
	ZVERNEC(Region.VLORE, "Zvërnec"),
	VLORE(Region.VLORE, "Vlorë"),
	RADHIME(Region.VLORE, "Radhimë"),
	ORIKUM(Region.VLORE, "Orikum"),
	PALASE(Region.HIMARE, "Palasë"),
	DRYMADES(Region.HIMARE, "Drymades"),
	DHERMI(Region.HIMARE, "Dhërmi"),
	GJIPE(Region.HIMARE, "Gjipe"),
	JALE(Region.HIMARE, "Jalë"),
	LIVADHI(Region.HIMARE, "Livadhi"),
	HIMARE(Region.HIMARE, "Himarë"),
	POTAM(Region.HIMARE, "Potam"),
	LLAMANI(Region.HIMARE, "Llamani"),
	QEPARO(Region.HIMARE, "Qeparo"),
	BORSH(Region.HIMARE, "Borsh"),
	LUKOVE(Region.HIMARE, "Lukovë"),
	BUNEC(Region.HIMARE, "Bunec"),
	KAKOME(Region.HIMARE, "Kakome"),
	SARANDE(Region.SARANDE, "Sarandë"),
	PASQYRA(Region.SARANDE, "Pasqyra"),
	PULEBARDHA(Region.SARANDE, "Pulëbardha"),
	KSAMIL(Region.SARANDE, "Ksamil");

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
	private final String label;

	Beach(Region region, String label) {
		this.region = region;
		this.label = label;
	}

	public Region region() {
		return region;
	}

	/** The display label, spelled as the map tiles draw the place; never a wire value. */
	public String label() {
		return label;
	}

	/** The beach for a wire code, empty for anything off the catalogue (never an exception). */
	public static Optional<Beach> fromCode(String code) {
		return Arrays.stream(values()).filter(b -> b.name().equals(code)).findFirst();
	}
}
