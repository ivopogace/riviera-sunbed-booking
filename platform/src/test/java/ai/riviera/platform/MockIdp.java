package ai.riviera.platform;

import java.net.URI;
import java.util.Objects;

import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Plays the browser between an SSO authorize and its callback against the in-app mock IdP: visits the IdP URL the
 * authorize produced and returns the callback request the IdP redirects back to, carrying its code (with the nonce)
 * and the echoed state. The caller adds the session cookie.
 */
public final class MockIdp {

	private MockIdp() {
	}

	/** The callback for an authorize that answered with a redirect to the IdP. */
	public static MockHttpServletRequestBuilder callback(MockMvc mvc, MvcResult authorize, String ip) throws Exception {
		return callback(mvc, URI.create(Objects.requireNonNull(authorize.getResponse().getRedirectedUrl(),
				"authorize redirect")), ip);
	}

	/** The callback for an IdP authorize URL handed over in a body (an operator's link start). */
	public static MockHttpServletRequestBuilder callback(MockMvc mvc, URI idp, String ip) throws Exception {
		String back = mvc.perform(get(idp).header("X-Forwarded-For", ip))
				.andExpect(status().isFound())
				.andReturn().getResponse().getRedirectedUrl();
		return get(URI.create(Objects.requireNonNull(back, "mock IdP redirect"))).header("X-Forwarded-For", ip);
	}
}
