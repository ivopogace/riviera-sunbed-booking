package ai.riviera.platform.auth.application;

import java.io.Serial;
import java.io.Serializable;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * One SSO round trip in flight, held in the HTTP session from authorize to callback and found there by its
 * {@code state} (#276). The callback acts on this record alone, never on the URL, so a state minted for one
 * audience or intent can never complete as another. A {@link Intent#LINK}, and only a link, names its {@link Linking}.
 */
public record SsoAuthorization(SsoProvider provider, Audience audience, Intent intent, String state,
		String codeVerifier, String nonce, Linking linking) implements Serializable {

	@Serial
	private static final long serialVersionUID = 1L;

	public SsoAuthorization {
		if (provider == null || audience == null || intent == null) {
			throw new IllegalArgumentException("provider, audience and intent are required");
		}
		if (isBlank(state) || isBlank(codeVerifier) || isBlank(nonce)) {
			throw new IllegalArgumentException("state, codeVerifier and nonce must not be blank");
		}
		if ((intent == Intent.LINK) != (linking != null)) {
			throw new IllegalArgumentException("a link, and only a link, names the linking operator");
		}
		if (intent == Intent.LINK && audience != Audience.OPERATOR) {
			throw new IllegalArgumentException("only an operator links an identity");
		}
	}

	private static boolean isBlank(String value) {
		return value == null || value.isBlank();
	}

	/** The signed-in operator that started a link: the id it links to and the principal name its session must hold. */
	public record Linking(long operatorId, String username) implements Serializable {

		@Serial
		private static final long serialVersionUID = 1L;
	}

	/** Which principal type the round trip may end in. */
	public enum Audience {
		CUSTOMER,
		OPERATOR
	}

	/** What the callback does with the verified identity. */
	public enum Intent {
		SIGN_IN,
		LINK
	}
}
