package ai.riviera.applicationjdbcfixture.springjdbc.application;

import org.springframework.jdbc.core.simple.JdbcClient;

/** Holds JDBC: an application service running its own SQL instead of calling an out port. */
public class JdbcClientService {

	private final JdbcClient jdbc;

	public JdbcClientService(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public int touch() {
		return jdbc.sql("SELECT 1").query(Integer.class).single();
	}
}
