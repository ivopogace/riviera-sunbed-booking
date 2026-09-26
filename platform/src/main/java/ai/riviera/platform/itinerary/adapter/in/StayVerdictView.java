package ai.riviera.platform.itinerary.adapter.in;

import ai.riviera.platform.itinerary.domain.StayVerdict;

/**
 * A venue's stay verdict on the wire: {@code verdict} is {@code SAME_SET} or {@code CANNOT_HOST};
 * {@code longestRunDays} and {@code maxStayDays} ({@code null} for any length) let the card say why.
 */
record StayVerdictView(String verdict, int sameSetCount, int longestRunDays, Integer maxStayDays) {

	static StayVerdictView of(StayVerdict verdict) {
		return new StayVerdictView(verdict.fit().name(), verdict.sameSetCount(), verdict.longestRunDays(),
				verdict.maxStayDays());
	}
}
