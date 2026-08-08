package ai.riviera.platform;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * The single {@link SsoGateway} bean active under {@code @Profile("sso")}: it dispatches by provider to
 * the per-provider {@link SsoProviderClient} adapters ({@code GoogleSsoGateway}, {@code AppleSsoGateway}),
 * which currently throw {@link UnsupportedOperationException} until S5. Composing them here keeps
 * exactly one {@code SsoGateway} bean per profile — the mock under {@code !sso}, this under {@code sso} —
 * so nothing is ambiguous and nothing silently falls back to the mock (design D-4). Package-private
 * (invariant #11).
 */
@Component
@Profile("sso")
class RealSsoGateway implements SsoGateway {

	private final Map<SsoProvider, SsoProviderClient> clients;

	RealSsoGateway(List<SsoProviderClient> providerClients) {
		this.clients = providerClients.stream()
				.collect(Collectors.toMap(SsoProviderClient::provider, Function.identity()));
	}

	@Override
	public URI authorizationRequest(SsoProvider provider, SsoAuthorizationChallenge challenge, URI redirectUri) {
		return clientFor(provider).authorizationRequest(challenge, redirectUri);
	}

	@Override
	public ExternalIdentity exchangeCode(SsoProvider provider, String code, String codeVerifier, URI redirectUri) {
		return clientFor(provider).exchangeCode(code, codeVerifier, redirectUri);
	}

	private SsoProviderClient clientFor(SsoProvider provider) {
		SsoProviderClient client = clients.get(provider);
		if (client == null) {
			throw new IllegalStateException("no SSO provider client registered for " + provider);
		}
		return client;
	}
}
