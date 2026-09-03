package ai.riviera.modulefixture;

/**
 * Stands in for a type sitting directly in {@code ai.riviera.platform} — app-wide config such as
 * {@code ScheduledQueryTimeout}. A module class depending on one of these makes the root both
 * depended-upon and depending, which is the cycle the kernel split exists to prevent.
 */
public interface RootShapedType {

	int seconds();
}
