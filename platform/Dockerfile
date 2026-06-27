# Multi-stage image for the Spring Boot backend (riviera-sunbed-booking).
# Build context is the `platform/` module directory (set Render's root directory
# to `platform`). Invariant #1 (JDBC-only) needs no special handling here — this
# just compiles whatever is on the classpath and runs the executable jar.

# --- Stage 1: build the executable jar with the JDK 25 toolchain --------------
FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace

# Copy the Gradle wrapper + build config first so dependency resolution is cached
# independently of source changes.
COPY gradlew gradlew
COPY gradle gradle
COPY build.gradle settings.gradle ./
RUN chmod +x gradlew && ./gradlew --no-daemon --version

# Warm the dependency cache (best-effort; ignore failure so source still builds).
RUN ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# Now the sources, then assemble the jar. Tests run in CI, not in the image build.
COPY src src
RUN ./gradlew --no-daemon clean bootJar -x test \
    && cp build/libs/*.jar /workspace/app.jar

# --- Stage 2: slim JRE runtime ------------------------------------------------
FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app

# Run as a non-root user.
RUN groupadd --system app && useradd --system --gid app --home /app app

COPY --from=build /workspace/app.jar /app/app.jar
USER app

# Render injects $PORT; Spring Boot is told to bind it (see SERVER_PORT env in the
# CD docs). Default to 8080 for local `docker run`.
ENV SERVER_PORT=8080
EXPOSE 8080

# Honour container memory limits; fail fast if the JVM can't start.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "/app/app.jar"]
