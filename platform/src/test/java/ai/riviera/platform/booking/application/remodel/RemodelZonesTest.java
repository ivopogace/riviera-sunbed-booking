package ai.riviera.platform.booking.application.remodel;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;

import org.junit.jupiter.api.Test;

import ai.riviera.platform.booking.application.BookingCutoff;
import ai.riviera.platform.booking.domain.RemodelZone;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * The remodel zone is a duration to service-day open (midnight in {@code Europe/Tirane}), never a
 * count of calendar days: the same booking answers the same zone at 23:00 and at 00:30 across the
 * midnight between them, and the two boundaries are the two windows exactly. Pure unit test (real
 * {@link BookingCutoff} + {@code Clock.fixed}); the zone holder's own clock is the instant
 * overload's default, so both arms are pinned.
 */
class RemodelZonesTest {

	private static final ZoneId TIRANE = ZoneId.of("Europe/Tirane");
	private static final RemodelWindows WINDOWS =
			new RemodelWindows(Duration.ofHours(24), Duration.ofHours(96));
	private static final LocalDate BOOKING_DATE = LocalDate.of(2026, 7, 15);
	private static final Instant OPENS_AT = BOOKING_DATE.atStartOfDay(TIRANE).toInstant();

	private static RemodelZones at(ZonedDateTime tiraneNow) {
		Clock clock = Clock.fixed(tiraneNow.toInstant(), ZoneId.of("UTC"));
		return new RemodelZones(new BookingCutoff(clock), WINDOWS, clock);
	}

	private static RemodelZone zoneAt(Instant now) {
		return at(now.atZone(TIRANE)).zoneOf(BOOKING_DATE);
	}

	@Test
	void theSameBookingIsInTheSameZoneAt2300AndAt0030AcrossMidnight() {
		// 49h and 47.5h to open sit in one band; a calendar-day rule would have flipped at midnight.
		LocalDate twoDaysOut = BOOKING_DATE.plusDays(1);
		assertEquals(RemodelZone.MOVE_ONLY,
				at(ZonedDateTime.of(2026, 7, 13, 23, 0, 0, 0, TIRANE)).zoneOf(twoDaysOut));
		assertEquals(RemodelZone.MOVE_ONLY,
				at(ZonedDateTime.of(2026, 7, 14, 0, 30, 0, 0, TIRANE)).zoneOf(twoDaysOut));
	}

	@Test
	void aBookingFiveDaysOutIsMoveOrRefundOnBothSidesOfMidnight() {
		LocalDate later = BOOKING_DATE.plusDays(4);
		assertEquals(RemodelZone.MOVE_OR_REFUND,
				at(ZonedDateTime.of(2026, 7, 13, 23, 0, 0, 0, TIRANE)).zoneOf(later));
		assertEquals(RemodelZone.MOVE_OR_REFUND,
				at(ZonedDateTime.of(2026, 7, 14, 0, 30, 0, 0, TIRANE)).zoneOf(later));
	}

	@Test
	void exactlyTheFreezeWindowBeforeOpenIsFrozen() {
		assertEquals(RemodelZone.FROZEN, zoneAt(OPENS_AT.minus(Duration.ofHours(24))));
		assertEquals(RemodelZone.MOVE_ONLY, zoneAt(OPENS_AT.minus(Duration.ofHours(24)).minusSeconds(1)));
	}

	@Test
	void exactlyTheNoticeFloorBeforeOpenIsMoveOnly() {
		assertEquals(RemodelZone.MOVE_ONLY, zoneAt(OPENS_AT.minus(Duration.ofHours(96))));
		assertEquals(RemodelZone.MOVE_OR_REFUND, zoneAt(OPENS_AT.minus(Duration.ofHours(96)).minusSeconds(1)));
	}

	@Test
	void anOpenedOrPastServiceDayIsFrozen() {
		assertEquals(RemodelZone.FROZEN, zoneAt(OPENS_AT));
		assertEquals(RemodelZone.FROZEN, zoneAt(OPENS_AT.plus(Duration.ofDays(3))));
	}

	@Test
	void theInstantOverloadAndTheClockArmAgree() {
		Instant now = OPENS_AT.minus(Duration.ofHours(50));
		RemodelZones zones = at(now.atZone(TIRANE));
		assertEquals(zones.zoneOf(BOOKING_DATE), zones.zoneOf(BOOKING_DATE, now));
	}
}
