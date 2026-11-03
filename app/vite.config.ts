import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createReadStream, statSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';

// In development the pipeline outputs under ../data/derived are served at /data with
// HTTP Range support, which geotiff.js needs to read only the parts of a COG it wants.
// In production the app reads the same files from Cloudflare R2 (VITE_DATA_BASE).
function serveDerivedData(): Plugin {
  const root = resolve(import.meta.dirname, '..', 'data', 'derived');
  const types: Record<string, string> = {
    '.tif': 'image/tiff', '.png': 'image/png', '.json': 'application/json',
  };
  return {
    name: 'serve-derived-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const url = (req.url ?? '/').split('?')[0];
        const file = join(root, decodeURIComponent(url));
        if (!file.startsWith(root)) return next();
        if (!existsSync(file) || !statSync(file).isFile()) {
          // A real 404, not Vite's index.html fallback: MapLibre treats a 404 tile as empty.
          res.statusCode = 404;
          res.end();
          return;
        }
        const size = statSync(file).size;
        res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');
        const range = req.headers.range;
        if (range) {
          const m = /bytes=(\d*)-(\d*)/.exec(range);
          const start = m && m[1] ? Number(m[1]) : 0;
          const end = m && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
        } else {
          res.setHeader('Content-Length', size);
          createReadStream(file).pipe(res);
        }
      });
    },
  };
}

// MapLibre 6 loads its worker with new URL('./maplibre-gl-worker.mjs', import.meta.url),
// which the bundle resolves to /assets/maplibre-gl-worker.mjs. The bundler does not emit
// that file, so without this the production map never starts (the request falls through
// to the site's index.html). Copy the worker, which is self-contained, next to the bundle.
function copyMaplibreWorker(): Plugin {
  return {
    name: 'copy-maplibre-worker',
    apply: 'build',
    generateBundle() {
      const dist = resolve(import.meta.dirname, 'node_modules', 'maplibre-gl', 'dist');
      for (const name of ['maplibre-gl-worker.mjs']) {
        const file = join(dist, name);
        if (existsSync(file)) this.emitFile({ type: 'asset', fileName: `assets/${name}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig(({ command }) => ({
  // Deployed under daviddonnell.com/demos/ground-truth/; dev serves at the root.
  base: command === 'build' ? '/demos/ground-truth/' : '/',
  plugins: [preact(), serveDerivedData(), copyMaplibreWorker()],
  // MapLibre loads its worker with new URL(..., import.meta.url); pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
