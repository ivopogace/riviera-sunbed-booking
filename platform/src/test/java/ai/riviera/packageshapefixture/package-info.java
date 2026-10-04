/**
 * Deliberately mis-shaped module trees for {@code PackageShapeArchitectureTests}' negative cases: each
 * fixture "module" below breaks exactly one package-shape rule, so every rule is proven to fail
 * without breaking production code. {@code clean} breaks none and {@code shared} keeps root types
 * legitimately; both must stay unreported. Test-scope only; never imported by production classes.
 */
package ai.riviera.packageshapefixture;
