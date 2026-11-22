// ============================================================
// ZKNSites Publisher Ã¢â‚¬â€ serve os sites publicados
// Asset-handler: recebe o HTML jÃƒÂ¡ renderizado via KV
// ============================================================
import { renderPage } from '../../../packages/shared/src/render';
import type { PageDocument } from '../../../packages/shared/src/types';

export interface PublisherEnv {
  PUBLISHED: KVNamespace;
  DB: D1Database;
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fallback(title: string, message: string): Response {
  return new Response(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:system-ui;background:#0b1120;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}
a{color:#00d9f5}</style></head><body><div><h1>Ã°Å¸â€Â§ ZKNSites</h1><p>${esc(message)}</p><p><a href="https://zknsites-app.gabrielrobin63.workers.dev">Crie seu site grÃƒÂ¡tis</a></p></div></body></html>`,
    { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: PublisherEnv): Promise<Response> {
    const url = new URL(request.url);
    const host = (request.headers.get('host') || url.hostname || '').toLowerCase();

    // Identifica o slug pelo host: slug.zknsites.com ou domÃƒÂ­nio customizado
    let slug = '';
    const cacheKey = `domain:${host}`;
    const domainSlug = await env.PUBLISHED.get(cacheKey);
    if (domainSlug) {
      slug = domainSlug;
    } else {
      const parts = host.split('.');
      const base = 'zknsites';
      if (parts.length >= 3 && parts[1] === base) slug = parts[0];
    }

    // Preview sem DNS: ?preview=slug  ou  /s/slug
    const preview = url.searchParams.get('preview') || url.pathname.match(/^\/s\/([\w-]+)/)?.[1];
    if (!slug && preview) slug = preview;

    if (!slug) return fallback('Site nÃƒÂ£o encontrado', 'Este endereÃƒÂ§o nÃƒÂ£o corresponde a nenhum site publicado.');

    // Preview do editor tem prioridade (TTL curto)
    const previewRaw = await env.PUBLISHED.get(`preview:${slug}`);
    const raw = previewRaw || await env.PUBLISHED.get(`site:${slug}`);
    if (!raw) return fallback('Site nÃƒÂ£o encontrado', 'Este site ainda nÃƒÂ£o foi publicado ou foi despublicado.');

    try {
      const site = JSON.parse(raw);
      // Tenta servir o HTML jÃƒÂ¡ renderizado no publish; se nÃƒÂ£o houver, renderiza agora
      if (site.html) {
        return new Response(site.html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
          },
        });
      }
      const doc = site.doc as PageDocument;
      if (!doc || !doc.root) return fallback('Erro', 'Documento do site invÃƒÂ¡lido.');
      const rendered = renderPage(doc);
      return new Response(rendered.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
      });
    } catch (e) {
      console.error('[publisher]', e);
      return fallback('Erro', 'NÃƒÂ£o foi possÃƒÂ­vel carregar este site.');
    }
  },
};
