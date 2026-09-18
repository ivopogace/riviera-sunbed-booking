#!/usr/bin/env node
// PROTOTYPE tooling: serves platform/map/** with Range support (ADR-0022 stand-in).
import { createReadStream, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../platform/map', import.meta.url));
const PORT = Number(process.env['MAP_TILE_PORT'] ?? 8080);

const CONTENT_TYPES = {
  '.json': 'application/json',
  '.pmtiles': 'application/octet-stream',
  '.pbf': 'application/x-protobuf',
  '.png': 'image/png',
};

function contentTypeFor(path) {
  return CONTENT_TYPES[extname(path)] ?? 'application/octet-stream';
}

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.replace(/^\/map\//, ''));
  const resolved = normalize(join(ROOT, decoded));
  return resolved.startsWith(ROOT) ? resolved : null;
}

const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  if (!req.url?.startsWith('/map/')) {
    res.writeHead(404).end('not found');
    return;
  }
  const path = safePath(req.url);
  if (!path || !existsSync(path)) {
    res.writeHead(404).end('not found');
    return;
  }
  const stat = statSync(path);
  const contentType = contentTypeFor(path);
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    const start = match ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType,
    });
    createReadStream(path, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Content-Type': contentType,
  });
  createReadStream(path).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[serve-map-tiles] serving ${ROOT} at http://localhost:${PORT}/map/**`);
});
