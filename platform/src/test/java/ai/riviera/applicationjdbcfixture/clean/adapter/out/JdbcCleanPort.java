package ai.riviera.applicationjdbcfixture.clean.adapter.out;

import org.springframework.jdbc.core.simple.JdbcClient;

import ai.riviera.applicationjdbcfixture.clean.application.CleanPort;

/** JDBC where it belongs: the adapter implementing the application's port, never flagged. */
public class JdbcCleanPort implements CleanPort {

	private final JdbcClient jdbc;

	public JdbcCleanPort(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public boolean touch() {
		return jdbc.sql("SELECT 1").query(Integer.class).single() == 1;
	}
}
