package ai.riviera.platform.customer.application;

import java.time.Period;

/**
 * The retention policy the sweep applies: a plain value {@code CustomerRetentionConfig} maps the bound
 * properties onto, so the inner hexagon stays framework-light.
 *
 * @param window    a {@link Period}, not a {@code Duration}, which has no year unit to parse {@code P10Y};
 *                  a booking whose last service day is on or after {@code today − window} (in
 *                  {@code Europe/Tirane}) retains the contact
 * @param batchSize the most contacts one sweep may scrub — its write and row-lock bound, not a cap on the walk
 */
public record RetentionWindow(Period window, int batchSize) {
}
