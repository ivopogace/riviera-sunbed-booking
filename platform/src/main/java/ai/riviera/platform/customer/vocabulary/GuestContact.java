package ai.riviera.platform.customer.vocabulary;

/**
 * The contact a tourist supplies at guest checkout (v1 has no accounts/auth). Email is the
 * natural key the directory matches on (find-or-create); name and phone let venue staff
 * recognise and reach the guest on arrival. A value object — validated at the web edge and
 * by the canonical constructor; never mutated.
 */
public record GuestContact(String email, String fullName, String phone) {

	public GuestContact {
		if (email == null || email.isBlank()) {
			throw new IllegalArgumentException("guest email is required");
		}
		if (fullName == null || fullName.isBlank()) {
			throw new IllegalArgumentException("guest full name is required");
		}
		if (phone == null || phone.isBlank()) {
			throw new IllegalArgumentException("guest phone is required");
		}
	}
}
