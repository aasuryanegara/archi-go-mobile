/** Deployment-focused source checks; this does not replace a real Vercel build. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(new URL('../', import.meta.url).pathname);
const read = (name) => readFile(resolve(root, name), 'utf8');
const pkg = JSON.parse(await read('package.json'));
const vercel = JSON.parse(await read('vercel.json'));
const vite = await read('vite.config.ts');
const entry = await read('index.ts');
const npmrc = await read('.npmrc');
const lock = JSON.parse(await read('package-lock.json'));
const checks = [
  ['Vercel Hono entrypoint preserves the configured app instance', entry.includes('import { Hono } from \"hono\"') && entry.includes('server/app.js') && entry.includes('instanceof Hono') && entry.includes('export default app')],
  ['Vite build writes static assets to public', /outDir:\s*path\.resolve\(root,\s*"public"\)/.test(vite)],
  ['source assets are separate from generated output', /publicDir:\s*path\.resolve\(root,\s*"public-assets"\)/.test(vite)],
  ['Vercel build does not bundle a persistent local server', pkg.scripts.build === 'vite build'],
  ['local server bundle remains an optional separate script', typeof pkg.scripts['build:local'] === 'string'],
  ['Node runtime is pinned to 22.x', pkg.engines?.node === '22.x'],
  ['Vercel runs the frontend build', vercel.buildCommand === 'npm run build' && vercel.framework === 'hono'],
  ['no custom static output directory overrides Hono detection', !Object.hasOwn(vercel, 'outputDirectory')],
  ['official npm registry configured', npmrc.includes('registry=https://registry.npmjs.org/')],
  ['lockfile has no third-party registry mirror', !Object.values(lock.packages ?? {}).some((x) => (x.resolved ?? '').includes('npm.mirrors.msh.team'))],
  ['esbuild install scripts are explicitly allow-listed', ['0.18.20','0.25.12','0.27.7','0.28.2'].every(v => pkg.allowScripts?.[`esbuild@${v}`] === true)],
  ['API route wiring retained', (await read('server/app.ts')).includes('endpoint: "/api/trpc"')],
  ['backend source is outside Vercel reserved api/ directory', !(await import('node:fs')).existsSync(resolve(root, 'api'))],
  ['Vercel uses one root Hono entrypoint', entry.includes('export default app')],
];
let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed++;
}
if (failed) process.exit(1);
console.log(`PASS all ${checks.length} Vercel deployment source checks`);
