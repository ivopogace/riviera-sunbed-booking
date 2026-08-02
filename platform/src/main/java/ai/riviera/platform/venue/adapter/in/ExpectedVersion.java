package ai.riviera.platform.venue.adapter.in;

/**
 * The one home of the required optimistic-concurrency token contract (#229 — dedup of the #224/#226
 * copies in {@code UpdateVenueProfileRequest}, {@code BeachMapLayoutRequest} and
 * {@code RowPriceRequest}; records cannot share a base type). Request bodies type the token
 * {@link Long} (not primitive) so an absent field is {@code null}, not a silent {@code 0} that would
 * match a fresh venue and re-open the last-write-wins hole; {@link #require(Long)} rejects the null
 * with the one {@code 400 INVALID_REQUEST} message (§6b) every optimistic-concurrency endpoint shares.
 */
final class ExpectedVersion {

	private ExpectedVersion() {
	}

	/** The loaded concurrency token, required — a missing {@code expectedVersion} is a 400, never a 0. */
	static long require(Long expectedVersion) {
		if (expectedVersion == null) {
			throw new IllegalArgumentException("expectedVersion is required");
		}
		return expectedVersion;
	}
}
