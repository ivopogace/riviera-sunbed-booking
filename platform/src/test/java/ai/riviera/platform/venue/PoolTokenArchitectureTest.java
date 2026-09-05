package ai.riviera.platform.venue;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.lang.classfile.ClassFile;
import java.lang.classfile.ClassModel;
import java.lang.classfile.constantpool.PoolEntry;
import java.lang.classfile.constantpool.StringEntry;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pins the pool vocabulary to {@code venue.vocabulary.Pool}: no production class other than the
 * enum holds {@code "ONLINE"} or {@code "WALK_IN"} as a string constant. A module that re-declares
 * the token compares against its own copy of a fact {@code venue} owns, and invariant #3 is enforced
 * by exactly such comparisons — so their operand must be the published type, never a local literal.
 *
 * <p>Scans compiled bytecode, and only its {@code CONSTANT_String} entries: a reference to
 * {@code Pool.ONLINE} leaves the field name behind as a {@code Utf8} entry in every consumer, which is
 * the legitimate use this rule exists to encourage, so a raw text scan would flag exactly the
 * classes that did the right thing. Context-free, sibling to {@code NoStripeConnectArchitectureTest};
 * the negative case is proven against {@code ai.riviera.poolfixture}, never by breaking production
 * code, and the positive case is non-vacuous because {@code Pool} itself must be the one holder.
 */
class PoolTokenArchitectureTest {

	private static final Path PRODUCTION_CLASSES = Path.of("build/classes/java/main/ai/riviera/platform");
	private static final Path FIXTURE_CLASSES = Path.of("build/classes/java/test/ai/riviera/poolfixture");
	private static final Set<String> POOL_TOKENS = Set.of("ONLINE", "WALK_IN");

	@Test
	void onlyPoolStatesThePoolTokens() throws IOException {
		assertEquals(List.of("ai/riviera/platform/venue/vocabulary/Pool"),
				classesHoldingAPoolLiteral(PRODUCTION_CLASSES),
				"the pool tokens are stated once, in venue.vocabulary.Pool — compare against it");
	}

	@Test
	void flagsAStrayPoolLiteral() throws IOException {
		assertEquals(List.of("ai/riviera/poolfixture/RoguePoolLiteral"),
				classesHoldingAPoolLiteral(FIXTURE_CLASSES));
	}

	private static List<String> classesHoldingAPoolLiteral(Path root) throws IOException {
		assertTrue(Files.isDirectory(root), "compiled classes not found at " + root.toAbsolutePath()
				+ " — run the test task so the compile tasks run first");
		try (Stream<Path> files = Files.walk(root)) {
			return files.filter(p -> p.toString().endsWith(".class"))
					.map(PoolTokenArchitectureTest::parse)
					.filter(PoolTokenArchitectureTest::holdsAPoolLiteral)
					.map(model -> model.thisClass().asInternalName())
					.sorted()
					.toList();
		}
	}

	private static ClassModel parse(Path classFile) {
		try {
			return ClassFile.of().parse(classFile);
		}
		catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private static boolean holdsAPoolLiteral(ClassModel model) {
		for (PoolEntry entry : model.constantPool()) {
			if (entry instanceof StringEntry literal && POOL_TOKENS.contains(literal.stringValue())) {
				return true;
			}
		}
		return false;
	}
}
