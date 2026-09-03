# Non-context modules: what Spring Modulith, Evans and Cockburn actually say about a module that owns no domain concept

**Status / provenance.** Findings only, no decision (that lands in an ADR). Gathered 2026-09-03
from primary sources; this revision supersedes an earlier draft whose Evans quotes were
search-snippet grade — every quote below was re-read against the source named in its citation.

- **Spring Modulith.** The repo pins **2.1.0** (`platform/build.gradle`,
  `springModulithVersion = "2.1.0"`). `https://docs.spring.io/spring-modulith/reference/` serves
  **2.1.1** (`<meta name="version" content="2.1.1">`); `/reference/2.1/…` and `/reference/2.1.0/…`
  both redirect to that unversioned page, so **no 2.1.0-specific rendered URL exists**
  (`/reference/2.1-SNAPSHOT/` is a separate, newer build). To quote 2.1.0 exactly, the
  `spring-projects/spring-modulith` repository was shallow-cloned at tag `2.1.0` and the reference
  read from its Asciidoc sources (`src/docs/antora/modules/ROOT/pages/*.adoc`); every quoted
  sentence was then confirmed present, unchanged, in the rendered 2.1.1 page. Javadoc is quoted
  from the tag's `.java` files. `github.com/…/raw/2.1.0/…` and `api.github.com` answered `403` in
  this session (the session's GitHub proxy wants `add_repo`); `raw.githubusercontent.com` and an
  anonymous `git clone --branch 2.1.0` worked.
- **Evans.** `https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf`
  downloaded (HTTP 200, 483,985 bytes, 59 PDF pages); text extracted with `pypdf`. **Page numbers
  below are the printed ones** (front matter roman; printed page = PDF page − 7). The fetch that
  failed for the earlier draft succeeded this time.
- **Vernon.** `vaughnvernon.com` and `kalele.io` were reachable (HTTP 200) but hold no first-party
  statement of the Core/Supporting/Generic taxonomy (details §2.4). Pearson's sample PDFs were
  reachable but omit the defining chapter. Vernon is therefore **skipped**, per the brief.
- **Cockburn.** `https://alistair.cockburn.us/hexagonal-architecture/` fetched directly (HTTP 200,
  ~110 kB, 4,569 words of text). The `web.archive.org` fallback was not needed; for the record it
  failed with `curl: (35) Recv failure: Connection reset by peer`.

**TL;DR**

- Spring Modulith defines an application module as "a unit of functionality" with a provided and
  a required interface. **"Bounded context" occurs nowhere** in the 2.1.0 reference sources, the
  rendered 2.1.1 pages, or the repository `readme.adoc`. "Domain" appears three times: the
  Overview's "domain-driven, modular applications", the jMolecules hook's "Domain-Driven Design …
  verification rules", and the README's "application modules driven by the domain" / "business
  modules". Nothing the tool defines or verifies asks whether a module owns a domain concept.
- CLOSED (default) hides internals and joins cycle detection; OPEN does neither and is documented
  as a legacy-migration aid that "usually hints at sub-optimal modularization". `verify()` checks
  three rules (acyclic module graph, API-package-only access, declared `allowedDependencies`) plus
  jMolecules rules if present. It never checks the *name* or *existence* of a named interface.
- `allowedDependencies = {}` "will allow no dependencies to other modules", but "code not assigned
  to any module in the first place" — the main package — stays reachable. Modulith has no fence in
  either direction between a module and the root package.
- Detection is all-or-nothing per strategy. The only way to keep the default strategy and leave
  one sub-package out is the ignore predicate at the inspection site,
  `ApplicationModules.of(Class, DescribedPredicate<? super JavaClass>)`. None of the 2.1.0 API
  annotations carries an opt-out attribute.
- The six bundled examples at 2.1.0 contain only `inventory` and `order`; no
  `shared`/`common`/`infrastructure` module exists. `@Modulithic(sharedModules)` is the one API
  acknowledgement of non-business code ("global Spring configuration and components") and is a
  bootstrap/dependency-exemption flag, not a module category.
- Evans (verified, pages given): a **bounded context** is "a boundary … within which a particular
  model is defined and applicable" (p. vi, 28); **Modules** are "(aka Packages)" that "contain a
  cohesive set of concepts" and are "part of the model" (p. 15); a **Shared Kernel** is "some
  subset of the domain model that the teams agree to share" (p. 31); a **Generic Subdomain** is a
  "cohesive subdomain … not the motivation for your project" whose "generic models" go "in
  separate modules" (p. 41); a **Cohesive Mechanism** is the "mechanistic 'how'" partitioned
  "into a separate lightweight framework" behind "an intention-revealing interface" (p. 44).
  Neither Generic Subdomain nor Cohesive Mechanism is placed in a bounded context by the text.
- Cockburn: **"domain" does not occur** on the page (0 of 4,569 words); "application" occurs 75
  times, "business logic" 5. The inside of the hexagon is "the application"; the worked example is
  a discount calculator. The pattern's stated concern is the inside/outside asymmetry, not what
  the inside models.

## 1. Spring Modulith 2.1.0

### 1a. What an application module is; "bounded context" never appears

> In a Spring Boot application, an application module is a unit of functionality that consists of
> the following parts:
> - An API exposed to other modules implemented by Spring bean instances and application events
>   published by the module, usually referred to as _provided interface_.
> - Internal implementation components that are not supposed to be accessed by other modules.
> - References to API exposed by other modules in the form of Spring bean dependencies,
>   application events listened to and configuration properties exposed, usually referred to as
>   _required interface_.

— `fundamentals.adoc` § *Application Modules* (tag 2.1.0); identical on
https://docs.spring.io/spring-modulith/reference/fundamentals.html (2.1.1).

> The application's _main package_ is the one that the main application class resides in. That is
> the class, that is annotated with `@SpringBootApplication` and usually contains the `main(…)`
> method used to run it. By default, each direct sub-package of the main package is considered an
> _application module package_.
>
> If this package does not contain any sub-packages, it is considered a simple one. […] Thus,
> naturally, the module's API consists of all public types in the package.

— `fundamentals.adoc` § *Simple Application Modules*.

**Grep** (case-insensitive: `bounded context`, `evans`, `domain-driven`, `domain driven`, `ddd`,
`technical module`, `infrastructure module`, `business module`) over the rendered 2.1.1 pages
Overview, Fundamentals, Verification, Testing, Events, Documentation, Appendix **and** all ten
2.1.0 Asciidoc sources plus `readme.adoc`:

- **"bounded context": 0 hits** everywhere. "Evans": 0. "technical module"/"infrastructure module": 0.
- `index.adoc` (Overview): "Spring Modulith is an opinionated toolkit to build domain-driven,
  modular applications with Spring Boot. In the same way that Spring Boot has an opinion on the
  technical arrangement of an application, Spring Modulith implements an opinion on how to
  structure an app functionally and allows its individual, logical parts to interact with each other."
- `verification.adoc`: "Spring Modulith optionally integrates with the jMolecules ArchUnit library
  and, if present, automatically triggers its Domain-Driven Design and architectural verification
  rules described here."
- `readme.adoc` (tag 2.1.0): "Spring Modulith allows developers to build well-structured Spring
  Boot applications and guides developers in finding and working with application modules driven
  by the domain." (rendered text; the source wraps "application modules" in a `link:` macro) and,
  in the Quickstart, "Create a Java package arrangement that puts business modules as direct
  sub-packages of the application's main package." Its example tree is `example`,
  `example.inventory`, `example.order`, captioned "The application root package" / "Application
  module packages".

The `@ApplicationModule` Javadoc is neutral: "Annotation to customize information of a
{@link Modulith} module." (`spring-modulith-api/…/ApplicationModule.java`, 2.1.0).

### 1b. CLOSED vs OPEN; what `verify()` checks

`ApplicationModule.Type` Javadoc, tag 2.1.0 (`Type type() default Type.CLOSED;`, `@since 1.2`):

> A closed application module exposes an API to other modules, but also allows to hide internals.
> Access to those internals from other modules is sanctioned. Also, closed application modules
> must not be part of dependency cycles.

> An open application module does not hide its internals, which means that access to those from
> other modules is not sanctioned. They are also excluded from the cycle detection algorithm. All
> types contained in an open module are part of the unnamed named interface.

`fundamentals.adoc` § *Open Application Modules*:

> The arrangement described above are considered closed as they only expose types to other modules
> that are actively selected for exposure. When applying Spring Modulith to legacy applications,
> hiding all types located in nested packages from other modules might be inadequate or require
> marking all those packages for exposure, too.
>
> […] Declaring an application module as open will cause the following changes to the verification:
> - Access to application module internal types from other modules is generally allowed.
> - All types, also ones residing in sub-packages of the application module base package are added
>   to the unnamed named interface, unless explicitly assigned to a named interface.
>
> NOTE: This feature is intended to be primarily used with code bases of existing projects
> gradually moving to the Spring Modulith recommended packaging structure. In a fully-modularized
> application, using open application modules usually hints at sub-optimal modularization and
> packaging structures.

`verification.adoc` § *Verifying Application Module Structure*:

> The verification includes the following rules:
> - _No cycles on the application module level_ — the dependencies between modules have to form a
>   directed acyclic graph.
> - _Efferent module access via API packages only_ — all references to types that reside in
>   application module internal packages are rejected. See Advanced Application Modules for
>   details. Dependencies into internals of Open Application Modules are allowed.
> - _Explicitly allowed application module dependencies only_ (optional) — an application module
>   can optionally define allowed dependencies via `@ApplicationModule(allowedDependencies = …)`.
>   If those are configured, dependencies to other application modules are rejected. See Explicit
>   Application Module Dependencies and Named Interfaces for details.
>
> Spring Modulith optionally integrates with the jMolecules ArchUnit library and, if present,
> automatically triggers its Domain-Driven Design and architectural verification rules described here.

`ApplicationModules.verify()` Javadoc (2.1.0): "Execute all verifications to be applied, unless
the verification has been executed before."

### 1c. Detection strategies; excluding one sub-package; no opt-out marker

`ApplicationModuleDetectionStrategy` Javadoc (`spring-modulith-core`, 2.1.0):

> Strategy interface to customize which packages are considered module base packages.

> Given the {@link JavaPackage} that Spring Modulith was initialized with, return the base packages
> that are supposed to be considered base packages for {@link ApplicationModule}s.

> A {@link ApplicationModuleDetectionStrategy} that considers all direct sub-packages of the
> Moduliths base package to be module base packages.
> `static ApplicationModuleDetectionStrategy directSubPackage() { return pkg -> pkg.getDirectSubPackages().stream(); }`

> A {@link ApplicationModuleDetectionStrategy} that considers packages explicitly annotated with
> {@link ApplicationModule} module base packages.

`fundamentals.adoc` § *Customizing Module Detection*:

> By default, application modules will be expected to be located in direct sub-packages of the
> package the Spring Boot application class resides in. An alternative detection strategy can be
> activated to only consider packages explicitly annotated, either via Spring Modulith's
> `@ApplicationModule` or jMolecules `@Module` annotation. That strategy can be activated by
> configuring the `spring.modulith.detection-strategy` to `explicitly-annotated`.
>
> If neither the default application module detection strategy nor the manually annotated one
> works for your application, the detection of the modules can be customized by providing an
> implementation of `ApplicationModuleDetectionStrategy`. […] You can then inspect the packages
> residing within that and select the ones to be considered application module base packages
> based on a naming convention or the like.

`appendix.adoc`, property `spring.modulith.detection-strategy` (default `none`):

> The strategy to be applied to detect application modules. Can either be the class name of a
> custom implementation of `ApplicationModuleDetectionStrategy` or `direct-subpackages` (which is
> also the final fallback if nothing is configured) or `explicitly-annotated` to only select
> packages explicitly annotated with `@ApplicationModule` or jMolecules' `@Module`.

**Excluding one sub-package while keeping the default strategy.** `fundamentals.adoc`
§ *Excluding Packages*:

> In case you would like to exclude certain Java classes or full packages from the application
> module inspection, you can do so with:
> `ApplicationModules.of(Application.class, JavaClass.Predicates.resideInAPackage("com.example.db")).verify();`
>
> Additional examples of exclusions: `com.example.db` — Matches all files in the given package
> `com.example.db`. `com.example.db..` — Matches all files in the given package (`com.example.db`)
> and all sub-packages (`com.example.db.a` or `com.example.db.b.c`). […]

`ApplicationModules.java` Javadoc, tag 2.1.0:

> Creates a new {@link ApplicationModules} relative to the given modulith type. Will inspect the
> {@link org.springframework.modulith.Modulith} annotation on the class given for advanced
> customizations of the module setup.
> `public static ApplicationModules of(Class<?> modulithType) { return of(modulithType, alwaysFalse()); }`

> Creates a new {@link ApplicationModules} relative to the given modulith type, and a
> {@link DescribedPredicate} which types and packages to ignore. Will inspect the
> {@link org.springframework.modulith.Modulith} and {@link org.springframework.modulith.Modulithic}
> annotations on the class given for advanced customizations of the module setup.
> `public static ApplicationModules of(Class<?> modulithType, DescribedPredicate<? super JavaClass> ignored)`

The one-argument factory the repo's `ModularityTests` calls is literally the two-argument one with
`alwaysFalse()` — nothing is ignored.

**Is there an annotation or `package-info` marker that opts a package out?** No. The
`org.springframework.modulith` package at tag 2.1.0 contains exactly `ApplicationModule`,
`ApplicationModuleInitializer`, `Modulith`, `Modulithic`, `NamedInterface`, `PackageInfo` (and
`package-info.java`). `@ApplicationModule` has four attributes (`id`, `displayName`,
`allowedDependencies`, `type`); `@Modulithic`/`@Modulith` have `systemName`,
`useFullyQualifiedModuleNames`, `sharedModules`, `additionalPackages`. A grep of the API sources
for `exclude`/`ignore` hits only the `Type.OPEN` Javadoc ("excluded from the cycle detection
algorithm"). Exclusion lives at the inspection call site or in a custom strategy, never in the package.

### 1d. `allowedDependencies` and the unassigned main-package code

`@ApplicationModule.allowedDependencies()` Javadoc, tag 2.1.0
(`String[] allowedDependencies() default { OPEN_TOKEN };`):

> List the names of modules that the module is allowed to depend on. Shared modules defined in
> {@link Modulith}/{@link Modulithic} will be allowed, too. Names listed are local ones, unless the
> application has configured {@link Modulithic#useFullyQualifiedModuleNames()} to {@literal true}.
> Explicit references to {@link NamedInterface}s need to be separated by a double colon
> {@code ::}, e.g. {@code module::API} if {@code module} is the logical module name and
> {@code API} is the name of the named interface.
>
> Declaring an empty array will allow no dependencies to other modules. To not restrict the
> dependencies at all, leave the attribute at its default value.

`fundamentals.adoc` § *Explicit Application Module Dependencies*, on the
`inventory → allowedDependencies = "order"` example:

> In this case code within the _inventory_ module was only allowed to refer to code in the _order_
> module (and code not assigned to any module in the first place). Find out about how to monitor
> that in Verifying Application Module Structure.

That parenthesis is the reference's only statement about unassigned types. Elsewhere the main
package is described purely as the detection root ("The application's _main package_ is the one
that the main application class resides in", §1a) and, in the README tree, as "The application
root package". Neither reference nor Javadoc describes any rule restricting a module's access to
main-package code, or main-package code's access to modules.

### 1e. `sharedModules`: what a "shared module" is to Modulith

`@Modulithic.sharedModules()` Javadoc, tag 2.1.0:

> The names of modules considered to be shared, i.e. which should always be included in the
> bootstrap, no matter what. Useful for code to contain global Spring configuration and components.

`@Modulith.sharedModules()` (the `@AliasFor` twin) reads "…in the bootstrap no matter what. Useful
for code to contain commons Spring configuration and components." `fundamentals.adoc`
§ *Customizing the Application Modules Arrangement*, attribute table:

> `sharedModules` — Declares the application modules with the given names as shared modules, which
> means that they will always be included in application module integration tests.

Two effects, both mechanical: inclusion in every `@ApplicationModuleTest` bootstrap, and exemption
from `allowedDependencies` ("Shared modules … will be allowed, too", §1d). It is not a taxonomy of
module kinds and appears in no example.

### 1f. Do the examples or docs show a technical/infrastructure module?

`spring-modulith-examples/` at tag 2.1.0 holds six applications; their `src/main/java` packages
are, exhaustively:

| Example | Module packages under `example` |
|---|---|
| `spring-modulith-example-epr-jdbc`, `-epr-mongodb`, `-epr-neo4j` | `inventory`, `order` |
| `spring-modulith-example-full` | `inventory`, `order`, `order.internal` |
| `spring-modulith-example-kafka`, `-outbox` | `order` |

A `find` over every example's `src/main` for `shared`, `common`, `infra`, `technical`, `util`,
`support` returns nothing; the ten `package-info.java` files sit only in `inventory`/`order`. The
reference's *Nested*, *Named Interfaces* and *Explicit Dependencies* sections use `inventory`,
`order`, `order.spi`, `order.internal`, `inventory.nested` throughout.

**How the documentation section labels modules.** `documentation.adoc` describes the Application
Module Canvas as "a tabular overview about the module and the most relevant elements in those
(Spring beans, aggregate roots, events published and listened to as well as configuration
properties)". The sample canvas's rows are *Base package*, *Spring components* (Services,
Repositories, Event listeners, Configuration properties, Others), *Aggregate roots*, *Published
events*, *Events listened to*, *Properties*. No row or label classifies a module as business vs
technical; "Aggregate roots" is "Any entities that we find repositories for or explicitly declared
as aggregate via jMolecules" and is simply empty for a module without them.

### 1g. Named interfaces; publishing from nested packages

`fundamentals.adoc` § *Named Interfaces*:

> By default and as described in Advanced Application Modules, an application module's base
> package is considered the API package and thus is the only package to allow incoming
> dependencies from other modules. In case you would like to expose additional packages to other
> modules, you need to use _named interfaces_. You achieve that by annotating the
> `package-info.java` file of those packages with `@NamedInterface` or a type explicitly annotated
> with `@org.springframework.modulith.PackageInfo`.

The section's worked example is a nested package, `example.order.spi`, annotated
`@org.springframework.modulith.NamedInterface("spi") package example.order.spi;`:

> The effect of that declaration is twofold: first, code in other application modules is allowed to
> refer to `SomeSpiInterface`. Application modules are able to refer to the named interface in
> explicit dependency declarations. […] For modules without explicitly described dependencies,
> both the application module root package *and* the SPI one are accessible.

`@NamedInterface` Javadoc (2.1.0): "Annotation to mark a package as named interface of a
{@link ApplicationModule} or assign a type to a named interface." — "If declared on a package, the
package's local name will be used as default name." Default discovery
(`NamedInterfaces.ofAnnotatedPackages`) is `basePackage.getSubPackagesAnnotatedWith(NamedInterface.class)`,
which filters `getSubPackages()` — the *recursive* set (the builder contrasts it with
`getDirectSubPackages()` for `.recursive()`), so an annotated package at any depth below the module
base is a named interface. Several per module (the repo's `api`, `vocabulary`, `events`, `spi`) is
ordinary usage; `verify()` (§1b) checks access *through* them, not that any particular one exists.

## 2. Evans (and Vernon if reachable)

Source: Eric Evans, *Domain-Driven Design Reference: Definitions and Pattern Summaries* (Domain
Language, Inc., © 2015, CC BY 4.0). All quotes verified against the extracted PDF text; page
numbers are the printed ones. Where the earlier draft's snippet differed, the PDF wording is used.

### 2.1 Definitions, with pages

**Definitions page (p. vi):**

> **domain** — A sphere of knowledge, influence, or activity. The subject area to which the user
> applies a program is the domain of the software.
> **model** — A system of abstractions that describes selected aspects of a domain and can be used
> to solve problems related to that domain.
> **bounded context** — A description of a boundary (typically a subsystem, or the work of a
> particular team) within which a particular model is defined and applicable.

(The *bounded context* definition is repeated at the head of Part IV, p. 28.)

**Bounded Context (p. 2):**

> Model expressions, like any other phrase, only have meaning in context.
> Therefore: Explicitly define the context within which a model applies. Explicitly set boundaries
> in terms of team organization, usage within specific parts of the application, and physical
> manifestations such as code bases and database schemas. Apply Continuous Integration to keep
> model concepts and terms strictly consistent within these bounds, but don't be distracted or
> confused by issues outside. Standardize a single development process within the context, which
> need not be used elsewhere.

**Modules (p. 15):**

> Everyone uses modules, but few treat them as a full-fledged part of the model. Code gets broken
> down into all sorts of categories, from aspects of the technical architecture to developers' work
> assignments. […] Yet it isn't just code being divided into modules, but also concepts.
> Therefore: Choose modules that tell the story of the system and contain a cohesive set of
> concepts. Give the modules names that become part of the ubiquitous language. Modules are part of
> the model and their names should reflect insight into the domain.
> […] Seek low coupling in the sense of concepts that can be understood and reasoned about
> independently. Refine the model until it partitions according to high-level domain concepts and
> the corresponding code is decoupled as well.
> (aka Packages)

**Shared Kernel (p. 31):**

> Sharing a part of the model and associated code is a very intimate interdependency, which can
> leverage design work or undermine it.
> […] Therefore: Designate with an explicit boundary some subset of the domain model that the teams
> agree to share. Keep this kernel small.
> Within this boundary, include, along with this subset of the model, the subset of code or of the
> database design associated with that part of the model. This explicitly shared stuff has special
> status, and shouldn't be changed without consultation with the other team.

**Core Domain (p. 40):**

> […] But scarce, highly skilled developers tend to gravitate to technical infrastructure or neatly
> definable domain problems that can be understood without specialized domain knowledge.
> Therefore: Boil the model down. Define a core domain and provide a means of easily distinguishing
> it from the mass of supporting model and code. Bring the most valuable and specialized concepts
> into sharp relief. Make the core small.
> […] Justify investment in any other part by how it supports the distilled core.

**Generic Subdomains (p. 41):**

> Some parts of the model add complexity without capturing or communicating specialized knowledge.
> Anything extraneous makes the core domain harder to discern and understand. The model clogs up
> with general principles everyone knows or details that belong to specialties which are not your
> primary focus but play a supporting role. Yet, however generic, these other elements are
> essential to the functioning of the system and the full expression of the model.
> Therefore: Identify cohesive subdomains that are not the motivation for your project. Factor out
> generic models of these subdomains and place them in separate modules. Leave no trace of your
> specialties in them.
> Once they have been separated, give their continuing development lower priority than the core
> domain, and avoid assigning your core developers to the tasks (because they will gain little
> domain knowledge from them). Also consider off-the-shelf solutions or published models for these
> generic subdomains.

**Cohesive Mechanisms (p. 44):**

> Computations sometimes reach a level of complexity that begins to bloat the design. The
> conceptual "what" is swamped by the mechanistic "how." A large number of methods that provide
> algorithms for resolving the problem obscure the methods that express the problem.
> Therefore: Partition a conceptually cohesive mechanism into a separate lightweight framework.
> Particularly watch for formalisms or well-documented categories of algorithms. Expose the
> capabilities of the framework with an intention-revealing interface. Now the other elements of
> the domain can focus on expressing the problem ("what"), delegating the intricacies of the
> solution ("how") to the framework.
> Factoring out generic subdomains reduces clutter, and cohesive mechanisms serve to encapsulate
> complex operations. This leaves behind a more focused model, with fewer distractions that add no
> particular value to the way users conduct their activities. But you are unlikely ever to find
> good homes for everything in the domain model that is not core.

(Correction to the earlier draft: the PDF reads "formalisms **or** well-documented categories of
algorithms", not "formalisms for …".)

**Segregated Core (p. 45):**

> Elements in the model may partially serve the core domain and partially play supporting roles.
> Core elements may be tightly coupled to generic ones. […]
> Therefore: Refactor the model to separate the core concepts from supporting players (including
> ill-defined ones) and strengthen the cohesion of the core while reducing its coupling to other
> code. Factor all generic or supporting elements into other objects and place them into other
> packages, even if this means refactoring the model in ways that separate highly coupled elements.

**Abstract Core (p. 46):** "Therefore: Identify the most fundamental differentiating concepts in
the model and factor them into distinct classes, abstract classes, or interfaces. […] Place this
abstract overall model in its own module, while the specialized, detailed implementation classes
are left in their own modules defined by subdomain."

Three further pages bear on "technical code with no model":

- **Layered Architecture (p. 10):** "Therefore: Isolate the expression of the domain model and the
  business logic, and eliminate any dependency on infrastructure, user interface, or even
  application logic that is not business logic. […] Related patterns, such as "Hexagonal
  Architecture" may serve as well or better to the degree that they allow our domain model
  expressions to avoid dependencies on and references to other system concerns."
- **Services (p. 14):** "Sometimes, it just isn't a thing. Some concepts from the domain aren't
  natural to model as objects. […] Therefore: When a significant process or transformation in the
  domain is not a natural responsibility of an entity or value object, add an operation to the
  model as a standalone interface declared as a service. […] State these assertions in the
  ubiquitous language of a specific bounded context."
- **Intention-Revealing Interfaces (p. 20):** "Therefore: Name classes and operations to describe
  their effect and purpose, without reference to the means by which they do what they promise."

### 2.2 Which pattern describes the proof-of-work issuer/verifier + nonce registry? (text only)

The object: a challenge issuer, a solution verifier and a single-use nonce registry; it owns no
concept a tourist, operator or admin names; only the HTTP edge calls it.

- **Bounded Context — not described by the text.** A bounded context is "a boundary … within which
  a particular model is defined and applicable" (p. vi) and the instruction is "Explicitly define
  the context within which a model applies" (p. 2). The object has no model of a domain (p. vi: a
  model "describes selected aspects of a domain"); there is nothing for the boundary to bound. A
  textual observation, not a ruling on how the repo may *label* a package.
- **Generic Subdomain — partial fit, with a mismatch.** The text's subject is "parts of the model"
  and "cohesive subdomains", i.e. "generic models" with their own knowledge ("specialties which
  are not your primary focus"); the instruction is "place them in separate modules" and "consider
  off-the-shelf solutions or published models" (p. 41). The fit is the priority clause ("not the
  motivation for your project", "lower priority than the core domain"); the mismatch is that the
  pattern presupposes a *model* of a subdomain, and an issuer/verifier is a computation with no
  subject-matter model to factor out.
- **Cohesive Mechanism — the closest textual fit, with one interpretive step.** The pattern's
  object is "the mechanistic 'how'" — "algorithms for resolving the problem" — partitioned "into a
  separate lightweight framework" exposed "with an intention-revealing interface", so that "the
  other elements of the domain can focus on expressing the problem" (p. 44); its cue is
  "formalisms or well-documented categories of algorithms". A hashcash-style proof-of-work with a
  replay registry is a well-documented algorithm category behind one question ("is this a valid,
  unspent solution?"). The interpretive step: Evans presents the mechanism as something that *had
  bloated the domain design* and is carved out of it; a mechanism that was never part of the model
  is not literally what p. 44 describes, though the resulting shape ("separate lightweight
  framework" + "intention-revealing interface") is the same.
- **Where the text puts each.** Generic Subdomains go "in separate modules" (p. 41); a Cohesive
  Mechanism becomes "a separate lightweight framework" (p. 44); Segregated Core moves "generic or
  supporting elements … into other packages" (p. 45); Layered Architecture keeps "infrastructure"
  out of the domain layer and names Hexagonal Architecture as an alternative (p. 10). **None of
  these pages says "bounded context"**; the term appears in Part IV (Context Mapping) and in
  *Services* (p. 14) — and *Services* is explicitly for "concepts from the domain", which the
  object is not.

### 2.3 Is Evans' "Modules" what Modulith's "module" means? Is Shared Kernel "a subset of the domain model"?

- **Modules.** Evans' pattern is literally "(aka Packages)" (p. 15): a package that "contain[s] a
  cohesive set of concepts", is "part of the model", and is named in "the ubiquitous language".
  Modulith's application module is "a unit of functionality" with provided/required interfaces
  (§1a). They coincide on the *unit* (a package) and the cohesion aim; they differ in what the unit
  must contain — Evans requires concepts of the model, Modulith requires nothing about content.
  Modulith's README colours its modules "driven by the domain"/"business modules" (§1a): Evans'
  expectation stated as guidance, not as a checked rule.
- **Shared Kernel.** Yes, by the text: "some subset of the domain model that the teams agree to
  share", with "the subset of code or of the database design associated with that part of the
  model" (p. 31) — a *context-mapping* relationship between teams sharing model. The repo's
  `shared` package (`ai.riviera.platform.shared`, `displayName = "Shared Kernel"`, citing "Evans,
  DDD ch. 14"; `CLAUDE.md`: "an OPEN Shared Kernel of edge/technical types") holds `ApiProblem`,
  `CurrentOperator` and the like; its own Javadoc says "technical shared code, not a bounded
  context" and its admission test is "no business logic, no module-owned state". That differs
  from Evans' definition — his kernel is *model* (plus its code/schema); the repo's is edge types
  with no model. What the two share is the discipline — "Keep this kernel small", "special status,
  and shouldn't be changed without consultation" — which the package Javadoc reproduces.
  **Finding:** the name is used for the discipline, not the definition. (Verified against p. 31.)

### 2.4 Vernon

No first-party text of the Core / Supporting / Generic taxonomy was reachable:

- `https://vaughnvernon.com/?s=subdomain` (HTTP 200): "Search Results for: subdomain — Sorry, no
  content matched your criteria." `?s=core+domain` / `?s=generic` return HTTP 202 challenge stubs
  (~190 bytes). `https://kalele.io/` and `/blog/` (200) contain no occurrence of "subdomain";
  `kalele.io/?s=subdomain` and `/innovating-with-domain-driven-design/` return 202 stubs;
  `/what-is-domain-driven-design/` is 404.
- Pearson samples: the *Implementing Domain-Driven Design* sample
  (`ptgmedia.pearsoncmg.com/images/9780321834577/samplepages/0321834577.pdf`, 109 pages) is front
  matter, chapter 1 and the index; the index entries "Generic Subdomains … defined, 52" and
  "Supporting Subdomains, 52" point into chapter 2 ("Domains, Subdomains, and Bounded Contexts",
  p. 43), which the sample omits. The *DDD Distilled* sample (`…/9780134434421/samplepages/
  9780134434421.pdf`, 38 pages) is chapter 1 plus an index entry "Generic Subdomain, 47". The
  entries confirm the taxonomy and where it is defined, but carry no definition text. Skipped
  rather than cited second-hand.

## 3. Cockburn

Source: Alistair Cockburn, *Hexagonal architecture — the original 2005 article*, HaT Technical
Report 2005.02, "Date: 2005-09-04 (v 0.9 to be updated after reader comments)",
https://alistair.cockburn.us/hexagonal-architecture/.

**Word counts** (4,569 words; case-insensitive whole word): **"domain" — 0**; "application" — 75;
"business logic" — 5; "entity" 1 / "entities" 1 (both "external entities"); "model" — 3 (all in
*Related Patterns*: "Model-View-Controller", "Model-Interactor", "Model-View-Presenter").

**Intent:**

> Allow an application to equally be driven by users, programs, automated test or batch scripts,
> and to be developed and tested in isolation from its eventual run-time devices and databases.
>
> As events arrive from the outside world at a port, a technology-specific adapter converts it
> into a usable procedure call or message and passes it to the application. The application is
> blissfully ignorant of the nature of the input device. […] The application has a semantically
> sound interaction with the adapters on all sides of it, without actually knowing the nature of
> the things on the other side of the adapters.

**What is inside** (*Motivation*, *Nature of the Solution*):

> One of the great bugaboos of software applications over the years has been infiltration of
> business logic into the user interface code.

> Both the user-side and the server-side problems actually are caused by the same error in design
> and programming — the entanglement between the business logic and the interaction with external
> entities. The asymmetry to exploit is not that between left and right sides of the application
> but between inside and outside of the application. The rule to obey is that code pertaining to
> the inside part should not leak into the outside part.

> The hexagonal, or ports and adapters, architecture solves these problems by noting the symmetry
> in the situation: there is an application on the inside communicating over some number of ports
> with things on the outside. The items outside the application can be dealt with symmetrically.

> However, the primary purpose of this pattern is to focus on the inside-outside asymmetry,
> pretending briefly that all external items are identical from the perspective of the application.

*Use Cases And The Application Boundary*: "the use cases should generally be written at the
application boundary (the inner hexagon), to specify the functions and events supported by the
application, regardless of external technology."

**The worked example** (*Sample Code*): "The simplest application that demonstrates the ports &
adapters fortunately comes with the FIT documentation. It is a simple discount computing
application: `discount(amount) = amount * rate(amount);` In our adaptation, the amount will come
from the user and the rate will come from a database, so there will be two ports." — a
computation with a test-harness adapter on one port and a (mock or real) repository adapter on the
other. *Related Patterns* lists Adapter, Model-View-Controller, Mock Objects and Loopback,
Pedestals, Checks, and Dependency Inversion/SPRING; DDD is not mentioned.

**Does the pattern presuppose a domain inside the hexagon?** By the text, no: the inside is "the
application" whose "business logic" must not leak outward; the page never uses "domain", nor
"model"/"entity" in the DDD sense, nor "aggregate". The pattern is defined by the inside/outside
asymmetry and the symmetric treatment of ports, and its own example is a rate lookup plus a
multiplication. Nothing conditions the pattern on the inside being a domain model; a hexagon
around an issuer/verifier with a registry adapter on a secondary port is structurally the same as
the article's Discounter with its rate-repository port. (Evans, p. 10, names "Hexagonal
Architecture" as a way to keep "domain model expressions" free of "other system concerns" — Evans
applying Cockburn's pattern to a domain, not Cockburn requiring one.)

## 4. The repo's structural nets

Read on PR #911's head (`cc2c7f6`, the unmerged challenge spine), by reading the tests, not the
docs about them. Paths are `platform/src/test/java/ai/riviera/platform/…`.

**How each net decides what a "module" is.** Every ArchUnit rule shares one classpath import,
`new ClassFileImporter().withImportOption(DO_NOT_INCLUDE_TESTS).importPackages("ai.riviera.platform")`
(`ArchitectureTestSupport.java:48-50`), and does package arithmetic on it: `moduleOf` is the first
segment below the base, `surfaceOf` the second, `null`/`""` for a root type (`:73-79, 97-109`).
Only `ModularityTests` (`:13,17`) and `DocumentationTests` (`:16-20`) use Modulith's
`ApplicationModules.of(PlatformApplication.class)` — the one-argument form, i.e. §1c's
`alwaysFalse()` ignore predicate. `ScheduledWorkArchitectureTest` keys `@Scheduled` methods by
`SimpleName#method` (`:136`); `EndpointRoleGateCoverageTest` keys `VERB pattern` from the handler
mapping behind a `startsWith("ai.riviera.platform")` bean filter (`:131,185`);
`ResponsibilitiesArchitectureTests` scans class-file constant pools, and only for `file:`-scheme
sources (`:393-398`). No `spring.modulith.detection-strategy` is set (`application.properties`);
`platform/settings.gradle` is a single project (`rootProject.name = 'platform'`).

**Scenario A — a new direct sub-package `ai.riviera.platform.challenge`, closed, full template,
no `domain/`.** Two nets react, the rest pass as-is:

- `CompositionRootDisciplineTests` fails until a grant row is added. The map (`:67-71`) is
  `customer → {api, vocabulary}`, `operator → {api, vocabulary}`, `notification → {api}`,
  `shared → {""}`; lookup is `getOrDefault(module, Set.of()).contains(surface)` (`:125`), so an
  unlisted module is deny-all. Rows that exist are honoured; there is no "every module has a row"
  assertion (six modules have none). The fixtures under `ai.riviera.rootfixture` model only
  root→module cases.
- `PublishedSurfacePlacementArchitectureTests` (`:182-189`) requires everything under `api/` to be
  a non-sealed interface; PR #911's `ProofOfWorkChallenges` is a `final class`, so publishing it
  means an interface in `api/` with the implementation in `application/`. `vocabulary/` accepts an
  enum and a record (`:215` rejects plain interfaces only).
- `PackageShapeArchitectureTests` passes: `api, vocabulary, application, adapter` are in
  `ALLOWED_TOP_LEVEL` (`:55-56`), `adapter/{in,out}` in `ALLOWED_ADAPTER_CHILDREN` (`:59`),
  `domain` is optional (`:29-32`). `ScheduledWorkArchitectureTest`'s `"ChallengeRegistrySweep#sweep"`
  (`:74`) and `EndpointRoleGateCoverageTest`'s `"GET /api/auth/challenge"` (`:91`) are
  package-agnostic. `CustomerAuthPlacementTests:28-30` / `OperatorAuthPlacementTests:27-29` forbid
  only `customer..` / `operator..` from depending on `org.springframework.security..`.

**Scenario A′ — the same package as `type = OPEN` with flat classes (the `shared` shape).**
`PackageShapeArchitectureTests` and `PublishedSurfacePlacementArchitectureTests` skip module-root
types (`:84-86`; `surfaceOf == ""`), so the adapter/application split is unchecked; only the grant
row `challenge → {""}` is needed.

**Scenario B — excluded from Modulith.** Nothing in the repo excludes a package today (bare
`ApplicationModules.of`, the only `ImportOption` is `DO_NOT_INCLUDE_TESTS`). An ignore predicate at
the `ModularityTests` call site blinds Modulith and the Documenter only; every arithmetic net still
counts `ai.riviera.platform.<x>` as module `<x>`, so the two censuses diverge.

**Scenario C — a separate Gradle subproject.** With base `ai.riviera.platform.challenge` on the
classpath every scan still sees it, but its classes arrive with `jar:` source URIs, which the
sole-writer bytecode scan silently drops. With base `ai.riviera.challenge` it is outside every
scan and outside `@SpringBootApplication` component scanning (`PlatformApplication.java:6`, no
`scanBasePackages`); `ScheduledWorkArchitectureTest` (`:86`) and `EndpointRoleGateCoverageTest`
(`:149-152`) go red because their hard-coded anchors vanish, the rest go blind-green.

**Module → root: no mechanical rule.** `CompositionRootDisciplineTests` iterates root types only
(`moduleOf(type) == null`, `:114`) and inspects their outbound dependencies; no rule names a root
type as a target; Modulith treats root types as "code not assigned to any module" (§1d). Today no
module imports a root type (`grep '^import ai.riviera.platform\.[A-Z]'` over the ten module trees is
empty) — the rule holds by discipline, stated in `ScheduledQueryTimeout.java:30-31` ("they cannot
depend on the root — nothing may").

**`ScheduledQueryTimeout`.** A root `@Component record` validating
`riviera.scheduled.query-timeout-seconds` (1..300) once at boot (`:35-55`). Injected only by root
classes: `ObservabilityConfig.java:60` and PR #911's `JdbcChallengeRegistry.java:28`. Module sweep
adapters read the raw property instead — `booking/adapter/out/JdbcBookings.java:78,104-106`,
`JdbcGuestBookingHistory.java:42,64-66`, `customer/adapter/out/JdbcAccountErasure.java:65,89-91`.
`ScheduledQueryTimeoutIT.everyScheduledEntryQueryIsBounded` (`:137-153`) hand-lists five entry
statements and does not include the challenge sweep's `DELETE` today, at any placement.

**Sole-writer rule shape.** `ResponsibilitiesArchitectureTests` lists `set_availability` →
`availability` (`:84,87`), `review` → `review` (`:96`, SQL-shaped regex), `rating_tenths` /
`reviews_count` → `venue` (`:104,107`), Stripe SDK → `payment` (`:90,93`). Each rule excludes
`moduleOf(type) == <owner>`; with the writer at the root (`moduleOf == null`) the exclusion has no
name to match, so the rule presupposes a module home.

**Root code that references the challenge classes** (`platform/src/main`): `SecurityConfig`
(`@EnableConfigurationProperties({… AltchaProperties.class})` `:54-55`; `CHALLENGE_PATH =
ChallengeController.PATH` `:245`; the chain bean takes `ProofOfWorkChallenges` `:292-294` and
registers `new ChallengeVerificationFilter(challenges)` after `CsrfFilter` `:303`; the
`ProofOfWorkChallenges` `@Bean` `:537-541`), `RateLimitFilter` (`ChallengeController.PATH` `:131`,
its own challenge buckets `:182`, `RequestPaths.withinApplication` `:328,385,474`),
`SecurityProblemResponses` (three bodies `:41-54`, writers `:77-89`). `AdminAuditFilter` uses
neither `SecurityProblemResponses` nor `RequestPaths` (raw `getRequestURI()`, `:65,91`);
`RateLimitFilter` owns its own `RATE_LIMITED_BODY` (`:89-91`).

**The admin audit log has the same two-part shape**: `AdminAuditFilter` (a `SecurityConfig`-
registered `OncePerRequestFilter`, `SecurityConfig.java:305`) → `AdminAuditLog` port (root
interface; Javadoc `:13-18` "Composition-root state, not a module's … An edge-internal seam, not a
module surface") → `JdbcAdminAuditLog` on `admin_audit_record` (`V38`), plus `AdminAuditController`
(`GET /api/admin/audit`) and `AdminAuditReasons`. Differences from the challenge: no sweep, no
properties record, no service object between filter and port, no response body.

## Sources

| URL | What was retrieved | Date | Status |
|---|---|---|---|
| https://docs.spring.io/spring-modulith/reference/index.html | Overview; page serves 2.1.1 (`meta version`) | 2026-09-03 | verified |
| https://docs.spring.io/spring-modulith/reference/2.1/index.html , `/2.1.0/index.html` | HTTP 200 but redirect to the unversioned 2.1.1 page | 2026-09-03 | verified (no 2.1.0 URL) |
| https://docs.spring.io/spring-modulith/reference/fundamentals.html | Application Modules; Simple/Advanced/Nested/Open; Excluding Packages; Explicit Dependencies; Named Interfaces; Customizing Module Detection; `@Modulithic` table | 2026-09-03 | verified against 2.1.0 adoc |
| https://docs.spring.io/spring-modulith/reference/verification.html | the `verify()` rule list | 2026-09-03 | verified against 2.1.0 adoc |
| https://docs.spring.io/spring-modulith/reference/{testing,events,appendix,documentation}.html | grepped for "bounded context" etc.; `spring.modulith.detection-strategy`; canvas rows | 2026-09-03 | verified |
| `git clone --branch 2.1.0 https://github.com/spring-projects/spring-modulith` (commit `c75f173e`) | `src/docs/antora/modules/ROOT/pages/*.adoc`, `readme.adoc`, `spring-modulith-api/**`, `spring-modulith-core/**/{ApplicationModules,ApplicationModuleDetectionStrategy,NamedInterfaces,JavaPackage}.java`, `spring-modulith-examples/**` | 2026-09-03 | verified |
| https://raw.githubusercontent.com/spring-projects/spring-modulith/2.1.0/… | same Java files and `readme.adoc` (cross-check) | 2026-09-03 | verified |
| https://github.com/spring-projects/spring-modulith/raw/2.1.0/… ; https://api.github.com/repos/spring-projects/spring-modulith/… | HTTP 403 from the session's GitHub proxy | 2026-09-03 | failed (not needed) |
| https://www.domainlanguage.com/wp-content/uploads/2016/05/DDD_Reference_2015-03.pdf | full PDF, 59 pages; pp. vi, 2, 10, 14, 15, 20, 28, 31, 39–46 read | 2026-09-03 | verified |
| https://vaughnvernon.com/ , https://vaughnvernon.com/?s=subdomain | home; site search returns no match | 2026-09-03 | reachable, no definition text |
| https://kalele.io/ , https://kalele.io/blog/ , https://kalele.io/?s=subdomain | home + blog (no "subdomain"); search returns a 202 stub | 2026-09-03 | reachable, no definition text |
| https://ptgmedia.pearsoncmg.com/images/9780321834577/samplepages/0321834577.pdf | IDDD sample (front matter, ch. 1, index); ch. 2 absent | 2026-09-03 | verified (insufficient) |
| https://ptgmedia.pearsoncmg.com/images/9780134434421/samplepages/9780134434421.pdf | DDD Distilled sample (ch. 1, index); ch. 3 absent | 2026-09-03 | verified (insufficient) |
| https://alistair.cockburn.us/hexagonal-architecture/ | full article text | 2026-09-03 | verified |
| https://web.archive.org/web/2024/https://alistair.cockburn.us/hexagonal-architecture/ | `curl: (35) Recv failure: Connection reset by peer` | 2026-09-03 | failed (not needed) |
| `platform/build.gradle`; `platform/src/main/java/ai/riviera/platform/shared/package-info.java`; `platform/src/test/java/ai/riviera/platform/ModularityTests.java` | the 2.1.0 pin; the `shared` Javadoc/annotation; the one-argument `ApplicationModules.of(...)` call | 2026-09-03 | verified (repo) |
