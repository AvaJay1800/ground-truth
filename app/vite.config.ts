import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createReadStream, statSync, existsSync } from 'node:fs';
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

export default defineConfig(({ command }) => ({
  // Deployed under daviddonnell.com/demos/ground-truth/; dev serves at the root.
  base: command === 'build' ? '/demos/ground-truth/' : '/',
  plugins: [preact(), serveDerivedData()],
  // MapLibre loads its worker with new URL(..., import.meta.url); pre-bundling breaks that path.
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}));
