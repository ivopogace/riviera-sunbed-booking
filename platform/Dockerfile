# check=skip=SecretsUsedInArgOrEnv
# ^ STRIPE_PUBLISHABLE_KEY (below) is a PUBLIC pk_ key — it is baked into the world-readable
#   client bundle by design and is not a secret, so the "secrets in ARG" lint is a false positive.
#
# Multi-stage image for the riviera-sunbed-booking backend, which ALSO serves the Angular SPA
# same-origin (issue #110). One service hosts both the app shell and /api, so the S1 session +
# CSRF cookies (issue #109) are first-party — the fix that GitHub Pages (cross-site) could not give.
#
# BUILD CONTEXT IS THE REPOSITORY ROOT, not platform/ — the build needs both platform/ and
# frontend/. On Render the backend service must set: Root Directory = (empty / repo root),
# Dockerfile Path = platform/Dockerfile. Locally: `docker build -f platform/Dockerfile .` from
# the repo root. Invariant #1 (JDBC-only) needs no special handling here.

# --- Stage 1: build the Angular SPA -------------------------------------------
# Node pinned to the repo's .nvmrc (26). Only PUBLIC build-time values enter the bundle
# (invariant: the bundle is world-readable — no secrets). apiBaseUrl is '' so the app calls /api
# on its own origin; the Stripe PUBLISHABLE (pk_) key arrives as a build arg (Render passes the
# service env var of the same name). Empty by default — sign-in works without it.
FROM node:26-bookworm-slim AS web
WORKDIR /web
ARG STRIPE_PUBLISHABLE_KEY=""
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Write the prod environment (same-origin; default base-href '/'). fileReplacements swaps this
# in for the production build (angular.json). Public values only.
RUN printf "export const environment = {\n  production: true,\n  apiBaseUrl: '',\n  stripePublishableKey: '%s',\n};\n" "$STRIPE_PUBLISHABLE_KEY" > src/environments/environment.prod.ts \
    && npm run build

# --- Stage 2: build the executable jar with the JDK 25 toolchain --------------
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# Copy the Gradle wrapper + build config first so dependency resolution is cached independently
# of source changes (paths are repo-root-relative now that the context is the repo root).
COPY platform/gradlew gradlew
COPY platform/gradle gradle
COPY platform/build.gradle platform/settings.gradle ./
RUN chmod +x gradlew && ./gradlew --no-daemon --version

# Warm the dependency cache (best-effort; ignore failure so source still builds).
RUN ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# Backend sources, then drop the built SPA into static/ so bootJar bundles it at
# classpath:/static/ (SpaWebConfig serves it, with an index.html deep-link fallback).
COPY platform/src src
COPY --from=web /web/dist/frontend/browser/ src/main/resources/static/
RUN ./gradlew --no-daemon clean bootJar -x test \
    && cp build/libs/*.jar /workspace/app.jar

# --- Stage 3: slim JRE runtime ------------------------------------------------
FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app

# Run as a non-root user.
RUN groupadd --system app && useradd --system --gid app --home /app app

COPY --from=build /workspace/app.jar /app/app.jar
USER app

# Render injects $PORT; Spring Boot is told to bind it (see SERVER_PORT env in the CD docs).
# Default to 8080 for local `docker run`.
ENV SERVER_PORT=8080
EXPOSE 8080

# Honour container memory limits; fail fast if the JVM can't start.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
