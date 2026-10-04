package ai.riviera.applicationjdbcfixture.clean.application;

/** JDBC-free: the application service calls its out port. */
public class CleanService {

	private final CleanPort port;

	public CleanService(CleanPort port) {
		this.port = port;
	}

	public boolean touch() {
		return port.touch();
	}
}
