package ai.riviera.platform.venue;

/**
 * The catalogue beaches reserved for ITs whose assertions read the tourist list by beach or region
 * and so need a beach no sibling IT in the shared Postgres container inserts on. Every other IT
 * fixture sits on {@code KSAMIL}. Claim a code here before using it in a list-reading IT, so a
 * collision is visible in one file rather than found as a flaky count.
 */
public final class IsolationBeaches {

	/** {@code VenueListControllerIT}: two beaches in one region for the region filter, one for sales close. */
	public static final String LIST_IT_REGION = "LEZHE";
	public static final String LIST_IT_BEACH_A = "SHENGJIN";
	public static final String LIST_IT_BEACH_B = "TALE";
	public static final String LIST_IT_SALES_CLOSE_BEACH = "PATOK";

	/** {@code SeasonClosureCatalogIT}: its four fixtures sort against each other and nothing else. */
	public static final String SEASON_CLOSURE_IT_BEACH = "VELIPOJE";

	private IsolationBeaches() {
	}
}
