package ai.riviera.platform;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

import ai.riviera.platform.audit.api.AdminAuditLog;
import ai.riviera.platform.audit.vocabulary.AdminAuditEntry;
import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The fence's failure contract ({@code RESPONSIBILITIES.md} §audit): a lost row never fails or masks the
 * action it records; the loss is an ERROR naming the routed path, so an encoded spelling is legible.
 */
class AdminAuditFilterTest {

	@AfterEach
	void clearContext() {
		SecurityContextHolder.clearContext();
	}

	@Test
	void aFailedAppendKeepsTheActionsStatusAndLogsTheRoutedPath() throws Exception {
		AdminAuditLog failing = new AdminAuditLog() {
			@Override
			public void append(String actor, String method, String path, int status, String reason) {
				throw new IllegalStateException("audit store down");
			}

			@Override
			public List<AdminAuditEntry> latest(int limit) {
				return List.of();
			}
		};
		AdminAuditFilter filter = new AdminAuditFilter(failing, "/api/admin/");
		SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(
				"operator", null, AuthorityUtils.createAuthorityList("ROLE_ADMIN")));
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/%61dmin/erasure");
		MockHttpServletResponse response = new MockHttpServletResponse();
		response.setStatus(204);

		Logger filterLogger = (Logger) LoggerFactory.getLogger(AdminAuditFilter.class);
		ListAppender<ILoggingEvent> appender = new ListAppender<>();
		appender.start();
		filterLogger.addAppender(appender);
		try {
			filter.doFilter(request, response, new MockFilterChain());
		}
		finally {
			filterLogger.detachAppender(appender);
		}

		assertEquals(204, response.getStatus(), "the recorded action's own status stands");
		assertEquals(1, appender.list.size());
		ILoggingEvent lost = appender.list.getFirst();
		assertEquals(Level.ERROR, lost.getLevel());
		assertTrue(lost.getFormattedMessage().contains("POST /api/admin/erasure by operator (status 204)"),
				lost.getFormattedMessage());
	}
}
