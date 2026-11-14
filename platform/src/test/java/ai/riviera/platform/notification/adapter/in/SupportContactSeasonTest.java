package ai.riviera.platform.notification.adapter.in;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.notification.application.SupportContact;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** The season is read in {@code Europe/Tirane} (invariant #6): on a UTC clock the edges fall an hour or two early. */
class SupportContactSeasonTest {

	@Test
	void mayBeginsAtMidnightInTiraneNotInUtc() {
		assertFalse(replyAt("2027-04-30T21:59:59Z"), "23:59 on 30 April in Tirane");
		assertTrue(replyAt("2027-04-30T22:00:00Z"), "00:00 on 1 May in Tirane (UTC+2)");
	}

	@Test
	void octoberEndsAtMidnightInTirane() {
		assertTrue(replyAt("2027-10-31T22:59:59Z"), "23:59 on 31 October in Tirane (UTC+1)");
		assertFalse(replyAt("2027-10-31T23:00:00Z"), "00:00 on 1 November in Tirane");
	}

	private static boolean replyAt(String instant) {
		Clock clock = Clock.fixed(Instant.parse(instant), ZoneOffset.UTC);
		return new SupportContactController(SupportContact.NONE, clock).supportContact().sameDayReply();
	}
}
