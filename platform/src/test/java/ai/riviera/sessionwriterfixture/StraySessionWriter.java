package ai.riviera.sessionwriterfixture;

import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Negative-proof fixture for {@code SessionWriterArchitectureTests}: a session write typed on a concrete repository. */
public final class StraySessionWriter {

	private StraySessionWriter() {
	}

	public static void write(SecurityContext context, HttpServletRequest request, HttpServletResponse response) {
		new HttpSessionSecurityContextRepository().saveContext(context, request, response);
	}
}
