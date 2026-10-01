# The root package in Spring Modulith 2.1: what the tool checks there, how to keep a package out of detection, and where the maintainer's own projects put security

**Status / provenance.** Findings only, no decision (that is ADR-0028). Gathered 2026-10-01 for
issue #1317. Each finding is labelled with how it was checked:

- **[docs]**: the reference at `https://docs.spring.io/spring-modulith/reference/` (serves 2.1.1;
  the repo pins **2.1.0**, `platform/build.gradle`). Quotes were re-read on the rendered
  `fundamentals.html` on 2026-10-01. Between 2.1.0 and 2.1.1 the only relevant change is the
  wording of one violation message (GH-1778).
- **[source]**: `spring-projects/spring-modulith` at tag `2.1.1`. File paths are relative to that
  repository.
- **[run]**: the source was compiled against `spring-modulith-core-2.1.0.jar` + ArchUnit 1.4.2,
  and `ApplicationModules.of(…).detectViolations()` was run on minimal packages. The outputs quoted
  below are verbatim. Package names `r1`…`r7` are those throwaway fixtures, not repo code.
- **[repo]**: this repository at `main` `28bccaf`.
- **[ref]**: a reference project cloned on 2026-10-01 at the commit named.

It extends `2026-09-03-non-context-modules-generic-subdomains-and-cohesive-mechanisms.md` §1, and
corrects that note's §1c on one point (finding 3 below).

## TL;DR

1. **The root package is a module to `verify()`, a hidden one.** Since 1.1 every root package
   becomes a synthetic `root:<package>` module. It covers that package only, not its sub-packages.
   `verify()` rejects root code that reaches a module's internals, and it rejects root ↔ module
   cycles. It does not check a module depending on root code. The root module is also left out
   of `ApplicationModules.stream()` and of the Documenter.
2. **Root beans load in every `@ApplicationModuleTest`.** Another module's beans load only when
   that module is part of the bootstrap. Moving a bean between the root and a module therefore
   changes what every module test loads.
3. **A sub-package *can* be kept out of module detection, but it is then checked by nothing.** The
   2026-09-03 note's §1c was right about the *default* strategy and the annotations: no annotation
   opts a package out. But `spring.modulith.detection-strategy=explicitly-annotated`, or a custom
   `ApplicationModuleDetectionStrategy`, does leave an un-annotated sub-package out. Its types then
   belong to no module, not even the root module. `verify()` never sees them as source or target,
   and no `@ApplicationModuleTest` scans them.
4. **The docs say nothing about where security code goes.** The maintainer's answer (Discussion
   #82) is a `core` module declared in `@Modulithic(sharedModules)`. In his own projects the root
   holds only the application class and app-wide config, the security filter chain included.
   Login machinery sits in a (shared) user-account module.
5. **OPEN is a migration aid.** A closed module's flat base package is already its public API.
6. **A shared module depends on nothing** in every reference project. Ours depends on `customer` and
   `operator`, which is what keeps it OPEN (§7).

## 1. The root package is verified as a hidden "root module"

**[docs]** The reference describes the main package only as the detection root: "The
application's _main package_ is the one that the main application class resides in. That is the
class, that is annotated with `@SpringBootApplication` and usually contains the `main(…)` method
used to run it." (`fundamentals.html`). On unassigned code it says only, in § *Explicit Application
Module Dependencies*, that inventory "was only allowed to refer to code in the order module (and
code not assigned to any module in the first place)". **Docs silent** on everything below.

**[source]** `ApplicationModules.rootModuleFor(…)` and `ApplicationModule.isRootModule()`
(`@since 1.1`) build one module per root package, with identifier `root:<package>`, from that
package alone (`toSingle()`, so sub-packages are excluded). `allModules()`, which `verify()` uses,
includes it. `stream()`/iteration and the Documenter do not. This came from issue #317,
"Modularity tests pass when code in application root package refers to module-internal
components" (milestone 1.1 RC1, `https://github.com/spring-projects/spring-modulith/issues/317`).
`isRootModule()` is present in the 2.1.0 jar (`javap`).

**[run]**

- Root class with a field of a module-internal type (`r1`):
  `Module 'root:r1' depends on non-exposed type r1.booking.internal.BookingInternal within module 'booking'!`
- Module with `allowedDependencies = {}` holding a field of a root type (`r2`): `VIOLATIONS: none`.
- Module and root referencing each other (`r3`):
  `Cycle detected: Slice booking -> Slice root:r3 -> Slice booking`.
- `getModuleByType(App)` answers `Optional[root:r1]`, `[root:r2]`, `[root:r3]`.

**[repo]** So the repo's two root rules split as follows.

- `CompositionRootDisciplineTests#rootTouchesOnlyGrantedModuleSurfaces` is a stricter version of
  something `verify()` already checks:
  - `verify()` stops the root at any module's published surface.
  - The grant map further limits *which* modules and surfaces the root may use.
- `#noModuleReachesTheRoot` covers what `verify()` does not check at all.
- The class Javadoc's "code in the base package is assigned to no module at all, which `verify()`
  permits", as of `28bccaf`, is true for the module → root direction only. #1317's PR corrects
  it.

## 2. What an `@ApplicationModuleTest` loads

**[docs]** `testing.html` § *Bootstrap modes*: `STANDALONE` (default) "Runs the current module
only"; `DIRECT_DEPENDENCIES` adds "all modules the current one directly depends on";
`ALL_DEPENDENCIES` "the entire tree". `@Modulithic(sharedModules)`: "will always be included in
application module integration tests" (`fundamentals.html`, attribute table). A missing
cross-module bean fails the bootstrap, and "it is usually a better option to mock the target
beans".

**[source]** `ModuleTypeExcludeFilter` keeps a scanned class if
`modules.withinRootPackages(className) || basePackages.couldContain(className)`
(`spring-modulith-test`, `ModuleTestExecution`). So root-package types are always scanned. The base
packages are the module, plus its dependencies per mode, plus `extraIncludes`, plus every shared
module.

**[repo]** This matches what the repo has seen.

- `PayoutModuleTest` mocks the root chain's collaborators. Its comment says "Modulith's STANDALONE
  bootstrap always supplies root-package beans, but a module's beans only when that module is
  bootstrapped — which `shared` is not, here", so it also mocks `CurrentOperator` and
  `CurrentCustomer`.
- `riviera-local-debug` § *Blast radius* records the same rule.
- `@Modulithic` is not declared anywhere, so `shared` is *not* a Modulith shared module, despite
  its name.

## 3. Keeping a sub-package out of detection (corrects the 2026-09-03 note §1c)

**[docs]** "By default, application modules will be expected to be located in direct
sub-packages of the package the Spring Boot application class resides in. An alternative detection
strategy can be activated to only consider packages explicitly annotated, either via Spring
Modulith's `@ApplicationModule` or jMolecules `@Module` annotation. That strategy can be activated
by configuring the `spring.modulith.detection-strategy` to `explicitly-annotated`." A custom
`ApplicationModuleDetectionStrategy` is the third option (`fundamentals.html` § *Customizing Module
Detection*).

**[source]** `ApplicationModuleDetectionStrategyLookup` checks three places in order:

1. the property, which takes `direct-sub-packages`, `explicitly-annotated` or a class name;
2. a deprecated `META-INF/spring.factories` key (it logs a warning);
3. otherwise `directSubPackage()`.

`explicitly-annotated` matches annotated packages at any depth.

**[run]** Fixture `r4` has:

- `annotated` with `allowedDependencies = {}`, holding a field of `plain.internal.*`;
- `plain`, not annotated, holding a field of `annotated.internal.*`;
- `plain.deep`, annotated.

Results:

- **Default strategy:** modules `annotated`, `plain` and `plain.deep` (parent `plain`), and the
  violation `Cycle detected: Slice annotated -> Slice plain -> Slice annotated`.
- **`explicitly-annotated`:** modules `annotated` and `plain.deep` (no parent), and
  `VIOLATIONS: none`. The un-annotated `plain` is checked by nothing, in either direction.
- **Gotcha:** `spring.modulith.detection-strategy=direct-subpackages`, the spelling the appendix
  gives, fails with `IllegalStateException: java.lang.ClassNotFoundException: direct-subpackages`.
  `direct-sub-packages` works.

**[source]** The other exclusion, the ignore predicate of `ApplicationModules.of(type, ignored)`
(`fundamentals.html` § *Excluding Packages*), drops classes at import. It reaches only the call site
that passes it. `@ApplicationModuleTest` (`verifyAutomatically` defaults to true) and the 2.0
startup verification build their model through `ApplicationModulesFactory.defaultFactory()`, i.e.
without the predicate, unless a custom factory is registered in `spring.factories`. **Docs silent.**

**[source]** Under the default strategy, a direct sub-package of the root is always a top-level
module, annotated or not. Nested modules (since 1.3: "The code in _Nested_ is only available from
_Inventory_ or any types exposed by sibling application modules nested inside _Inventory_",
`fundamentals.html` § *Nested Application Modules*) nest under a *module*. There is no nesting
under the root.

**Consequence.** Opting a package out keeps the dependency direction as Java sees it, but moves
the package's code to a place that is worse off than the root:

- `verify()` checks nothing there;
- no module test loads its beans;
- its types must be `public` for the root to use them.

## 4. Where the maintainer and reference projects put security and cross-cutting code

**[docs]** None of the reference pages has a section on security, filters, "infrastructure" or
technical modules. The README's quickstart says to put "business modules as direct sub-packages of
the application's main package" (2026-09-03 note §1a). `@Modulithic.sharedModules` Javadoc:
"Useful for code to contain global Spring configuration and components."

**Maintainer, Discussion #82** (`https://github.com/spring-projects/spring-modulith/discussions/82`).
Asked where "interceptors, filters, message converters or some utility classes" go, Oliver
Drotbohm answered: "Most projects I know of simply declare a `core` module and register that as a
shared module via the `@Modulithic` annotation." He linked Salespoint as the example.

**Community, Discussion #607** (`https://github.com/spring-projects/spring-modulith/discussions/607`;
the answer is by `@breun`, not a maintainer). On "configurations for jetty, spring security, etc":
"The easiest would be to put them inside or next to your application class in the same package."
The alternatives it lists are `explicitly-annotated`, a custom strategy, an open module, or a
package outside the application package imported explicitly.

**[ref]** What the projects actually do:

| Project (commit) | Root package holds | Security / login | Shared modules |
|---|---|---|---|
| `odrotbohm/spring-restbucks` (`ad97ad0`), the maintainer's | `Restbucks` (app), `DTO`, `JacksonCustomizations` | — | `@Modulithic(sharedModules = "core")`; `core` = `Currencies` + two JPA converters |
| `st-tu-dresden/salespoint` (`8844ee6`), the maintainer's teaching framework | `EnableSalespoint`, `Salespoint`, `SalespointProperties`, `SalespointSchedulingConfiguration`, `SalespointWebSecurityConfiguration` | Filter chain in the root. `useraccount` module holds `SpringSecurityAuthenticationManagement implements … UserDetailsService`, `Password`, `Role` and the `@LoggedIn` resolver | `core`, `support`, `quantity`, `useraccount` |
| `xsreality/spring-modulith-with-ddd` (`bbbabe0`), a community sample | `LibraryApplication`, `LibraryWebSecurityConfiguration` (`SecurityFilterChain`) | Chain in the root. `useraccount` module holds the JWT converter and the `@Authenticated` resolver | `useraccount` |

The pattern across all three:

- The root holds the application class and app-wide Spring configuration only (the table names them).
- Code that every module calls (value types, the current user) is a shared module.
- Login machinery sits in a module next to the user accounts.
- None of them keeps controllers, flows or orchestration in the root.

**[repo]** The repo diverges at two points:

- **Login is not inside the account modules.** `CustomerAuthPlacementTests` and
  `OperatorAuthPlacementTests` forbid Spring Security types in `customer` and `operator`. The
  Salespoint layout, login inside the account module, is therefore not available.
- **The root holds far more than the references' roots.** At `28bccaf` it holds 65 classes: the
  login/session/SSO/recovery machinery (about 30 of them), the security chain and its filters, the remodel composition
  (ADR-0020), the admin/erasure controllers and the observability jobs.

## 5. OPEN vs CLOSED for a flat module

**[docs]** OPEN: "Access to application module internal types from other modules is generally
allowed. All types, also ones residing in sub-packages of the application module base package are
added to the unnamed named interface". And: "This feature is intended to be primarily used with
code bases of existing projects gradually moving to the Spring Modulith recommended packaging
structure. In a fully-modularized application, using open application modules usually hints at
sub-optimal modularization and packaging structures." (`fundamentals.html` § *Open Application
Modules*). `ApplicationModule.Type` Javadoc: an OPEN module is also "excluded from the cycle
detection algorithm".

**[docs]** A closed module's "base package is considered the API package" (§ *Named
Interfaces*), so a module whose types all sit flat in its base package exposes all of them while
closed.

**[source]** The `allowedDependencies` check runs before the OPEN short-circuit. Listing an OPEN
module by its plain name allows every type in it, because its unnamed interface holds everything.

**[repo]** `shared` is OPEN (ADR-0007 Amendment 2, "OPEN means consumers reference its types
directly"), flat, with no sub-packages. It reaches only `customer::api`/`::vocabulary` and
`operator::api`/`::vocabulary`. Both of those declare `allowedDependencies = {}`, so no cycle
through `shared` exists for OPEN to hide.

## 6. Other 2.x facts relevant to a move

- **[docs]** `@Modulithic(sharedModules)` modules are auto-allowed: "Shared modules defined in
  Modulith/Modulithic will be allowed, too" (`@ApplicationModule.allowedDependencies` Javadoc).
- **[docs]** 2.0 added startup verification (`spring.modulith.runtime.verification-enabled`, needs
  `spring-modulith-runtime`, which the repo has as `runtimeOnly`) and module-aware Flyway; 2.1 added
  `@ModuleSlicing` for Boot slice tests (`testing.html`). Nothing in 2.1 changes detection or root
  handling.
- **[docs]** Observability instruments only "Spring components that are part of the application
  module's API", so root beans get no module spans.
- **Spring Security 7** (`docs.spring.io/spring-security/reference/servlet/configuration/java.html`
  § *Modular HttpSecurity Configuration*): `Customizer<HttpSecurity>` beans are applied to *every*
  `HttpSecurity` bean, ordered by `@Order`. A module can contribute chain configuration that way,
  but it applies to every chain, not one.

## 7. A shared module sits at the bottom of the graph

**[docs]** A module named in `@Modulithic(sharedModules)` is included in every module test's
bootstrap and allowed to every module (§2, §6). If it depends on any module, every module that uses
it closes a cycle through that dependency.

**[ref]** The reference projects' shared modules import no other module:

- `grep '^import org.salespointframework'` over Salespoint's `core` returns nothing.
- Restbucks' `core` holds `Currencies` and two JPA converters.
- The DDD sample's `useraccount` imports only itself.

**[repo]** Our `shared` reaches `customer::api`/`::vocabulary` and `operator::api`/`::vocabulary`, for
`CurrentCustomer` and `CurrentOperator` only. Any `customer`/`operator` → `shared` dependency is
therefore a cycle, hidden today only because `shared` is OPEN (§5). It has already stopped one
design. `02e30298` (#386): "an Emails helper in the shared OPEN kernel is architecturally impossible:
shared depends on customer::api/::vocabulary while customer declares allowedDependencies = {}, so the
three customer-side call sites would have closed customer -> shared -> customer::api, the same cycle
shape #371 removed."

## Sources

- `https://docs.spring.io/spring-modulith/reference/fundamentals.html`, `testing.html`,
  `verification.html`, `appendix.html`, `runtime.html` (2.1.1, read 2026-10-01).
- `https://github.com/spring-projects/spring-modulith` tag `2.1.1`: `ApplicationModules.java`,
  `ApplicationModule.java`, `ApplicationModuleDetectionStrategyLookup.java`,
  `spring-modulith-test/…/ModuleTestExecution.java`, `ModuleTypeExcludeFilter`.
- Issue #317, Discussion #82, Discussion #607, issue #524 (`sharedModules` takes no nested package).
- `https://github.com/odrotbohm/spring-restbucks` `ad97ad0`; `https://github.com/st-tu-dresden/salespoint`
  `8844ee6`; `https://github.com/xsreality/spring-modulith-with-ddd` `bbbabe0`.
- `https://docs.spring.io/spring-security/reference/servlet/configuration/java.html` (7.1.1).
