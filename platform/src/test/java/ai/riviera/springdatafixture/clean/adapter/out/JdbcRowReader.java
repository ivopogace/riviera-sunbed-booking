package ai.riviera.springdatafixture.clean.adapter.out;

import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;

/** JDBC as ADR-0001 wants it: hand-written SQL on {@code JdbcClient}; {@code org.springframework.dao} is not Spring Data. */
public class JdbcRowReader {

	private final JdbcClient jdbc;

	public JdbcRowReader(JdbcClient jdbc) {
		this.jdbc = jdbc;
	}

	public int count() {
		try {
			return jdbc.sql("SELECT count(*) FROM fixture_mapped_row").query(Integer.class).single();
		}
		catch (DataAccessException e) {
			throw new IllegalStateException("fixture read failed", e);
		}
	}
}
