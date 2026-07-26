package ai.riviera.platform;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * The two session-identity operations a password change performs (#344), unit-tested at the helper rather
 * than through MockMvc — because the no-session case is <strong>not reachable</strong> from a web slice:
 * {@code SecurityMockMvcRequestPostProcessors.user(…)} stores the test {@code SecurityContext} in a
 * session, so every {@code with(user(…))} request already has one. Asserting the guard there would have
 * asserted nothing.
 *
 * <p>The guard still earns its place: {@code changeSessionId()} throws with no session — the servlet spec
 * says {@link IllegalStateException} and {@code MockHttpServletRequest} an {@code IllegalArgumentException},
 * so this pins "does not throw" rather than a type — and a password change with no session to rotate has
 * nothing to fail about. {@link SessionIdentity#currentId} has carried the same guard since #128, when
 * the customer twin first needed it; #326 copied it to the operator side and #344 moved both here.
 */
class SessionIdentityTest {

	@Test
	void currentIdIsTheSessionIdWhenThereIsASession() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		MockHttpSession session = new MockHttpSession();
		request.setSession(session);

		assertThat(SessionIdentity.currentId(request)).isEqualTo(session.getId());
	}

	/** Must never create one on the way — a read that starts a session would be a side effect. */
	@Test
	void currentIdIsNullWithNoSessionAndDoesNotCreateOne() {
		MockHttpServletRequest request = new MockHttpServletRequest();

		assertThat(SessionIdentity.currentId(request)).isNull();
		assertThat(request.getSession(false)).isNull();
	}

	@Test
	void rotateGivesTheSessionAFreshId() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		MockHttpSession session = new MockHttpSession();
		request.setSession(session);
		String idBefore = session.getId();

		SessionIdentity.rotate(request);

		assertThat(session.getId()).isNotEqualTo(idBefore);
	}

	@Test
	void rotateIsANoOpWithNoSession() {
		MockHttpServletRequest request = new MockHttpServletRequest();

		assertThatCode(() -> SessionIdentity.rotate(request)).doesNotThrowAnyException();
		assertThat(request.getSession(false)).isNull();
	}
}
