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
 * <p>The guard still earns its place: rotating with no session throws — the servlet spec says
 * {@link IllegalStateException} and {@code MockHttpServletRequest} an {@code IllegalArgumentException},
 * so this pins "does not throw" rather than a type — and a password change with no session to rotate has
 * nothing to fail about. {@link SessionIdentity#currentId} has carried the same guard since #128, when
 * the customer twin first needed it; #326 copied it to the operator side and #344 moved both here.
 *
 * <p><strong>Scope caveat (#359).</strong> {@code MockHttpSession} models neither Spring Session's deferred
 * post-request save nor the {@code SPRING_SESSION} row, so nothing here is evidence that the rotation
 * survives a concurrent request — a green run of this class says only that the local contract holds. The
 * durability guarantee is pinned end-to-end by {@code OperatorPasswordChangeIT}, {@code SetPasswordIT} and
 * {@code AuthSessionIT} against Testcontainers Postgres.
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

	/** Reads the request's CURRENT session, not the pre-rotation handle — since #359 that one is dead. */
	@Test
	void rotateGivesTheSessionAFreshId() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		String idBefore = request.getSession(false).getId();

		SessionIdentity.rotate(request);

		assertThat(request.getSession(false).getId()).isNotEqualTo(idBefore);
	}

	/** The carry-over that keeps the caller signed in — {@code SPRING_SECURITY_CONTEXT} and friends. */
	@Test
	void rotateCarriesTheSessionAttributesOver() {
		MockHttpServletRequest request = new MockHttpServletRequest();
		request.setSession(new MockHttpSession());
		request.getSession(false).setAttribute("SPRING_SECURITY_CONTEXT", "the-context");

		SessionIdentity.rotate(request);

		assertThat(request.getSession(false).getAttribute("SPRING_SECURITY_CONTEXT")).isEqualTo("the-context");
	}

	@Test
	void rotateIsANoOpWithNoSession() {
		MockHttpServletRequest request = new MockHttpServletRequest();

		assertThatCode(() -> SessionIdentity.rotate(request)).doesNotThrowAnyException();
		assertThat(request.getSession(false)).isNull();
	}
}
