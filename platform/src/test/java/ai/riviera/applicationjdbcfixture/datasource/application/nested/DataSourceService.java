package ai.riviera.applicationjdbcfixture.datasource.application.nested;

import javax.sql.DataSource;

/** Holds JDBC in a use-case sub-package of {@code application/}: a raw {@code DataSource}. */
public class DataSourceService {

	private final DataSource dataSource;

	public DataSourceService(DataSource dataSource) {
		this.dataSource = dataSource;
	}

	public DataSource dataSource() {
		return dataSource;
	}
}
