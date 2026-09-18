package ai.riviera.platform.venue.adapter.in;

import ai.riviera.platform.venue.vocabulary.Beach;

/**
 * The one place a wire beach code becomes a catalogue {@link Beach}, shared by the create and the
 * profile-edit bodies. A missing code and an off-catalogue code are both
 * {@link IllegalArgumentException} → {@code 400 INVALID_REQUEST}; the message names the vocabulary,
 * never the enum mechanics.
 */
final class BeachCode {

	private BeachCode() {
	}

	static Beach parse(String code) {
		if (code == null || code.isBlank()) {
			throw new IllegalArgumentException("beach is required");
		}
		return Beach.fromCode(code)
				.orElseThrow(() -> new IllegalArgumentException("Unknown beach: " + code));
	}
}
