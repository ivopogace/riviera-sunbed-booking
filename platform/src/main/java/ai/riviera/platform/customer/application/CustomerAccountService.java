package ai.riviera.platform.customer.application;

import java.util.Locale;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import ai.riviera.platform.customer.api.CustomerAccountDirectory;
import ai.riviera.platform.customer.api.CustomerAccountProvisioning;
import ai.riviera.platform.customer.api.CustomerAccounts;
import ai.riviera.platform.customer.api.SsoAccountProvisioning;
import ai.riviera.platform.customer.vocabulary.CustomerAccountCredential;
import ai.riviera.platform.customer.vocabulary.CustomerAccountId;
import ai.riviera.platform.customer.vocabulary.RegistrationOutcome;
import ai.riviera.platform.customer.vocabulary.SsoProvider;

/**
 * The {@code customer} module's account application service (S2, epic #108): the read side of an
 * account's stored credential ({@link CustomerAccounts}) and the registration write side
 * ({@link CustomerAccountProvisioning}). This is the service that <strong>graduates</strong> the
 * previously-thin {@code customer} module to the full ADR-0007 template. Package-private behind the
 * published ports (invariant #11); constructor injection into a {@code final} {@link CustomerAccountStore}.
 *
 * <p>It holds <strong>no</strong> Spring Security type: the stored {@code passwordHash} is an opaque
 * blob supplied already-encoded by the edge, and this service never encodes or verifies it — the
 * password-checking machinery stays at the platform edge (RV-BE-11, {@code RESPONSIBILITIES.md}).
 * Email is normalized here (trimmed + lower-cased, matching the guest {@code JdbcCustomerDirectory}
 * key) so account and guest emails resolve identically. The write is {@code @Transactional}; the read
 * is a pure query.
 */
@Service
class CustomerAccountService
		implements CustomerAccounts, CustomerAccountProvisioning, CustomerAccountDirectory, SsoAccountProvisioning {

	private final CustomerAccountStore store;

	CustomerAccountService(CustomerAccountStore store) {
		this.store = store;
	}

	@Override
	public Optional<CustomerAccountCredential> findByEmail(String email) {
		return store.findByEmail(normalize(email));
	}

	@Override
	public Optional<CustomerAccountId> accountFor(String email) {
		return store.findIdByEmail(normalize(email));
	}

	@Override
	@Transactional
	public RegistrationOutcome register(String email, String passwordHash) {
		return store.insertIfAbsent(normalize(email), passwordHash);
	}

	@Override
	@Transactional
	public CustomerAccountId resolveOrCreate(SsoProvider provider, String subject, String email) {
		return store.resolveSsoAccount(provider, subject, normalize(email));
	}

	private static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}
}
