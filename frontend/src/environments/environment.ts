/**
 * Default (development) environment. Replaced at production build time by
 * `environment.prod.ts` via the `fileReplacements` in angular.json.
 */
export const environment = {
  production: false,
  // Local backend (Spring Boot default / docker-compose). See application.properties.
  apiBaseUrl: 'http://localhost:8080',
};
