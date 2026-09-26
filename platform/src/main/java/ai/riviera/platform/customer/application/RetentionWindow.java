package ai.riviera.platform.customer.application;

import java.time.Period;

/**
 * The retention policy the sweep applies: a plain value {@code CustomerRetentionConfig} maps the bound
 * properties onto, so the inner hexagon stays framework-light.
 *
 * @param window    a {@link Period}, not a {@code Duration}, which has no year unit to parse {@code P10Y};
 *                  a booking whose last service day is on or after {@code today − window} (in
 *                  {@code Europe/Tirane}) retains the contact
 * @param batchSize the most rows a single sweep may scrub, so a run stays bounded regardless of backlog
 */
public record RetentionWindow(Period window, int batchSize) {
}
