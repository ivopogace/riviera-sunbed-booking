package ai.riviera.platform.venue.application;

/**
 * One held set on the owner's daily availability read: the set id and its authoritative
 * {@code set_availability} state token for the asked day — {@code BOOKED_ONLINE} (an online hold,
 * paid or not) or {@code STAFF_MARKED} (a staff walk-in mark). Free sets are never carried —
 * absence from the list <em>is</em> the free signal. Internal to the {@code venue} module
 * (REST-only consumer), so it lives in {@code application}, not {@code vocabulary} (invariant #11).
 */
public record SetDayState(long setId, String state) {
}
