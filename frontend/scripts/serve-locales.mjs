/**
 * Serves the localized production build (`dist/frontend/browser`, from `npm run build`) on
 * http://localhost:4300 for the locale e2e (`playwright.locales.config.ts`), with the rules Spring's
 * `SpaWebConfig` + `SpaLocale` apply in production (ADR-0030): a file that exists is served, a
 * missing path with an extension is a 404, and any other path is its locale's `index.html` by its
 * first segment (`/sq/…`, `/it/…`), else the root's. `/api/**` is the spec's to mock.
 */
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FRONTEND = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(FRONTEND, 'dist/frontend/browser');
const PORT = 4300;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const angular = JSON.parse(readFileSync(path.join(FRONTEND, 'angular.json'), 'utf8'));
const subPaths = Object.entries(angular.projects.frontend.i18n.locales).map(
  ([locale, config]) => config.subPath ?? locale,
);

if (!existsSync(path.join(ROOT, 'index.html'))) {
  console.error(`No build at ${ROOT}: run \`npm run build\` first.`);
  process.exit(1);
}

function shellFor(relative) {
  const first = relative.split('/')[0];
  return path.join(ROOT, subPaths.includes(first) ? first : '', 'index.html');
}

createServer((request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1);
  const file = path.normalize(path.join(ROOT, relative));
  const send = (target, status = 200) => {
    response.writeHead(status, {
      'content-type': TYPES[path.extname(target)] ?? 'application/octet-stream',
    });
    createReadStream(target).pipe(response);
  };
  if (!file.startsWith(ROOT)) {
    response.writeHead(400).end();
  } else if (existsSync(file) && statSync(file).isFile()) {
    send(file);
  } else if (path.extname(relative) || relative.startsWith('api/')) {
    response.writeHead(404).end();
  } else {
    send(shellFor(relative));
  }
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
