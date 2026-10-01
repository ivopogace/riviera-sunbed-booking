/**
 * Published <strong>vocabulary</strong> of the {@code monitoring} module: the metric names
 * ({@link ai.riviera.platform.monitoring.vocabulary.ObservabilityMetrics}, a constants holder) and the
 * worker half of the correlation id ({@link ai.riviera.platform.monitoring.vocabulary.MdcTaskDecorator},
 * stateless, built with {@code new} in each pool's config). Neither is a port; why they sit here and not
 * behind a bean: {@code riviera-modulith} § <em>Published surface by kind</em>. Granted as
 * {@code monitoring::vocabulary} wherever a reference survives compilation (the metric names inline).
 */
@org.springframework.modulith.NamedInterface("vocabulary")
package ai.riviera.platform.monitoring.vocabulary;
