// PROTOTYPE tooling, throwaway. Stands in for the backend on :8080 so the spike has real tiles:
//
//   cd frontend && npm start                                   # the SPA on :4200
//   node src/app/pages/prototype-map/tiles.mjs                 # this, on :8080
//   open http://localhost:4200/prototype/map-desktop?variant=a
//
// It answers the two things `environment.apiBaseUrl` points at: `/map/**`, served straight off
// `platform/map/` on disk with Range support (MapLibre reads `riviera.pmtiles` by byte range and
// gets nothing without a 206), and `/proto-photo/*.svg`, answered with generated stand-ins — the
// spike judges photo MASS, never pictures. `./gradlew bootRun` serves the same `/map/**` for real
// and can replace it; nothing else on :8080 is needed, since the venues are a fixture.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const MAP_DIR = join(HERE, '../../../../../platform/map');
const PORT = Number(process.env.PROTO_PORT ?? 8080);

/**
 * The SPA is on another origin in dev, so every answer carries CORS — and for the map that is not
 * a formality. MapLibre reads `riviera.pmtiles` with a `Range` header, which is not a safelisted
 * request header, so the browser sends an OPTIONS preflight first and drops every tile if it is
 * not answered. `content-range` must be exposed too, or the 206 body arrives unreadable.
 */
function cors(req) {
  return {
    'access-control-allow-origin': req.headers.origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-expose-headers': 'content-range, content-length, accept-ranges, etag',
    vary: 'origin',
  };
}

const TYPES = {
  '.pmtiles': 'application/octet-stream',
  '.json': 'application/json',
  '.pbf': 'application/x-protobuf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

/** Six fixture hues, picked so a card's photo band reads as mass rather than as a picture. */
const HUES = [188, 202, 168, 34, 210, 152];

function photo(name) {
  const seed = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const hue = HUES[seed % HUES.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480">
<defs><linearGradient id="g" x1="0" y1="0" x2="0.4" y2="1">
<stop offset="0" stop-color="hsl(${hue} 62% 62%)"/><stop offset="1" stop-color="hsl(${(hue + 26) % 360} 54% 34%)"/>
</linearGradient></defs>
<rect width="720" height="480" fill="url(#g)"/>
<circle cx="${140 + (seed % 380)}" cy="128" r="54" fill="hsl(44 92% 72%)" opacity="0.85"/>
<path d="M0 352 Q 180 ${300 + (seed % 60)} 360 348 T 720 344 V480 H0 Z" fill="hsl(${hue} 48% 26%)" opacity="0.55"/>
</svg>`;
}

function serveMap(req, res, urlPath) {
  // Font stacks arrive percent-encoded ("Roboto%20Regular"); undecoded, every glyph range 404s
  // and the map draws without a single label.
  const wanted = decodeURIComponent(urlPath.slice('/map/'.length));
  const file = join(MAP_DIR, normalize(wanted).replace(/^(\.\.[/\\])+/, ''));
  let size;
  try {
    size = statSync(file).size;
  } catch {
    res.writeHead(404, cors(req)).end('no such map file');
    return;
  }
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!range) {
    res.writeHead(200, {
      ...cors(req),
      'content-type': type,
      'content-length': size,
      'accept-ranges': 'bytes',
    });
    createReadStream(file).pipe(res);
    return;
  }
  const start = range[1] === '' ? size - Number(range[2]) : Number(range[1]);
  const end = range[1] === '' || range[2] === '' ? size - 1 : Math.min(Number(range[2]), size - 1);
  res.writeHead(206, {
    ...cors(req),
    'content-type': type,
    'content-length': end - start + 1,
    'content-range': `bytes ${start}-${end}/${size}`,
    'accept-ranges': 'bytes',
  });
  createReadStream(file, { start, end }).pipe(res);
}

createServer((req, res) => {
  const urlPath = (req.url ?? '/').split('?')[0];
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...cors(req),
      'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      'access-control-allow-headers': req.headers['access-control-request-headers'] ?? 'range',
      'access-control-max-age': '600',
    });
    res.end();
    return;
  }
  if (urlPath.startsWith('/map/')) {
    serveMap(req, res, urlPath);
    return;
  }
  if (urlPath.startsWith('/proto-photo/')) {
    res.writeHead(200, {
      ...cors(req),
      'content-type': 'image/svg+xml',
      'cache-control': 'no-store',
    });
    res.end(photo(urlPath));
    return;
  }
  if (urlPath.startsWith('/api/')) {
    // The shell asks who is signed in on every load; nobody is, and a 401 says so quietly.
    res.writeHead(401, { ...cors(req), 'content-type': 'application/json' }).end('{}');
    return;
  }
  res.writeHead(404, cors(req)).end('prototype stand-in backend: only /map/** and /proto-photo/**');
}).listen(PORT, () =>
  console.log(`prototype backend on http://localhost:${PORT} (map from ${MAP_DIR})`),
);
