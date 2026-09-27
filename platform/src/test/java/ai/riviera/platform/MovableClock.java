package ai.riviera.platform;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * A UTC clock an IT moves by hand, published as the context's {@code @Primary Clock} through a
 * {@code @TestConfiguration}: every reader sees the same instant until the test moves it. The venue
 * season-closure IT carries its own copy; new fixed-time ITs share this one.
 */
public final class MovableClock extends Clock {

	private volatile Instant now;

	public MovableClock(Instant now) {
		this.now = now;
	}

	public void set(Instant instant) {
		now = instant;
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return Clock.fixed(now, zone);
	}

	@Override
	public Instant instant() {
		return now;
	}
}
