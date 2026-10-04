package ai.riviera.platform.booking.application.remodel;

/**
 * What a confirmed booking still holds, read under its row lock: the amount less its refunded days (invariant #5)
 * and whether every service day is refunded, which leaves the remodel nothing to refund (#1300).
 */
public record LockedRemainder(long remainingMinor, boolean everyDayRefunded) {
}
