// Copia o frontend do builder para dist/ (usado pelo Cloudflare Pages)
import { cp, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const src = join(root, 'apps', 'builder', 'public');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(src, dist, {
  recursive: true,
  filter: (source) => !/worker\.js$|wrangler\.toml$|\.wrangler/.test(source.replace(/\\/g, '/')),
});
console.log('Frontend copiado para dist/');
