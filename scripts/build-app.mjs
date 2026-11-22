// Copia o frontend do builder para dist/ (usado pelo Cloudflare Pages)
import { cp, rm, mkdir, writeFile } from 'node:fs/promises';
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

// Proxy: URLs limpas em zknsites.pages.dev apontam para o publisher,
// escondendo o domínio da conta (gabrielrobin63.workers.dev).
await writeFile(join(dist, '_worker.js'), `const ORIGIN = 'https://zknsites-publisher.gabrielrobin63.workers.dev';
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const prev = url.searchParams.get('preview');
    if (prev) {
      const r = await fetch(ORIGIN + '/?preview=' + encodeURIComponent(prev) + (url.searchParams.get('page') ? '&page=' + encodeURIComponent(url.searchParams.get('page')) : ''));
      return new Response(r.body, { status: r.status, headers: r.headers });
    }
    const m = url.pathname.match(/^\\/s\\/([\\w-]+)/);
    if (m) {
      const r = await fetch(ORIGIN + '/?site=' + encodeURIComponent(m[1]));
      return new Response(r.body, { status: r.status, headers: r.headers });
    }
    return env.ASSETS.fetch(request);
  },
};
`);
console.log('Frontend + proxy copiados para dist/');
