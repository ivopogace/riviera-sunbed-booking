package ai.riviera.domainpurityfixture.persisted.domain;

import java.sql.Timestamp;

/** Impure: a domain rule reasoning in the JDBC API's time type rather than {@code java.time}. */
public final class TimestampRule {

	private TimestampRule() {
	}

	public static boolean isPast(Timestamp at) {
		return at.getTime() < System.currentTimeMillis();
	}
}
