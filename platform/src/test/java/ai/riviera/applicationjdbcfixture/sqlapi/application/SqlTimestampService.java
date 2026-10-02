package ai.riviera.applicationjdbcfixture.sqlapi.application;

import java.sql.Timestamp;

/** Holds JDBC: an application service reasoning in the JDBC API's time type. */
public final class SqlTimestampService {

	private SqlTimestampService() {
	}

	public static boolean isPast(Timestamp at) {
		return at.getTime() < System.currentTimeMillis();
	}
}
