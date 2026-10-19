// Build the app for daviddonnell.com/demos/ground-truth and copy it into the live
// site's repository, which Cloudflare Pages deploys on push.
//
//   node scripts/publish.mjs --site "C:\path\to\daviddonnell-ai checkout" [--data https://<r2 public host>/<prefix>]
//
// VITE_DATA_BASE must point at the R2 bucket's public URL (or pass --data). Nothing
// is committed here: review the diff in the site repo, then commit and push it.
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const site = opt('--site');
const data = opt('--data') ?? process.env.VITE_DATA_BASE;
if (!site || !existsSync(site)) { console.error('pass --site <path to the daviddonnell-ai checkout>'); process.exit(1); }
if (!data || !/^https?:\/\//.test(data)) { console.error('pass --data <https URL of the R2 bucket> or set VITE_DATA_BASE'); process.exit(1); }

const app = resolve(import.meta.dirname, '..');
console.log(`building with VITE_DATA_BASE=${data}`);
execSync('npx vite build', { cwd: app, stdio: 'inherit', env: { ...process.env, VITE_DATA_BASE: data } });

const dest = resolve(site, 'demos', 'ground-truth');
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(resolve(app, 'dist'), dest, { recursive: true });

// Cloudflare Pages _headers: let the service worker control the demo path and cache hashed assets.
const headersPath = resolve(site, '_headers');
const block = [
  '/demos/ground-truth/sw.js',
  '  Service-Worker-Allowed: /demos/ground-truth/',
  '  Cache-Control: no-cache',
  '/demos/ground-truth/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n');
const existing = existsSync(headersPath) ? readFileSync(headersPath, 'utf8') : '';
if (!existing.includes('/demos/ground-truth/sw.js')) writeFileSync(headersPath, `${existing.trimEnd()}\n\n${block}`);

console.log(`copied build to ${dest}`);
console.log('next: review `git status` in the site repo, commit, push; Cloudflare Pages deploys from main.');
