// ============================================================
// ZKNSites Publisher — serve os sites publicados
// ============================================================
import { renderPage } from '../../../packages/shared/src/render';
import type { PageDocument } from '../../../packages/shared/src/types';

export interface PublisherEnv {
  PUBLISHED: KVNamespace;
  DB: D1Database;
  ASSETS: R2Bucket;
}

function esc(s: string): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fallback(title: string, message: string): Response {
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + esc(title) + '</title>'
    + '<style>body{font-family:system-ui;background:#0b1120;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px}'
    + 'a{color:#00d9f5}</style></head><body><div>'
    + '<h1>&#128295; ZKNSites</h1><p>' + esc(message) + '</p>'
    + '<p><a href="https://zknsites-app.gabrielrobin63.workers.dev">Crie seu site gratis</a></p>'
    + '</div></body></html>';
  return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: PublisherEnv): Promise<Response> {
    const url = new URL(request.url);
    const host = (request.headers.get('host') || url.hostname || '').toLowerCase();

    // Assets dos usuarios (R2)
    if (url.pathname.startsWith('/u/')) {
      const key = url.pathname.slice(1);
      const obj = await env.ASSETS.get(key);
      if (!obj) return new Response('Not found', { status: 404 });
      return new Response(obj.body, {
        headers: {
          'Content-Type': obj.httpMetadata?.contentType || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // Identifica o site pelo host
    let slug = '';
    const domainSlug = await env.PUBLISHED.get(`domain:${host}`);
    if (domainSlug) {
      slug = domainSlug;
    } else {
      const parts = host.split('.');
      if (parts.length >= 3 && parts[1] === 'zknsites') slug = parts[0];
    }

    // Preview: ?preview=TOKEN_OPACO&page=SLUG
    const preview = url.searchParams.get('preview') || url.pathname.match(/^\/s\/([\w-]+)/)?.[1];
    const pageParam = url.searchParams.get('page') || '';
    if (preview) {
      if (!preview.startsWith('prev_')) {
        return fallback('Pre-visualizacao invalida', 'Este link de pre-visualizacao nao e valido.');
      }
      slug = preview;
    }

    if (!slug) return fallback('Site nao encontrado', 'Este endereco nao corresponde a nenhum site publicado.');

    const previewRaw = await env.PUBLISHED.get(`preview:${slug}`);
    const raw = previewRaw || await env.PUBLISHED.get(`site:${slug}`);
    if (!raw) return fallback('Site nao encontrado', 'Este site ainda nao foi publicado ou foi despublicado.');

    try {
      const site = JSON.parse(raw);

      // Pagina especifica: ?preview=TOKEN&page=slug  ou  /slug
      const pathSlug = url.pathname.replace(/^\/+|\/+$/g, '');
      const wanted = pageParam || (preview ? '' : pathSlug);
      if (wanted && site.pages?.[wanted]) {
        return new Response(site.pages[wanted].html, {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
        });
      }

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
      if (!doc || !doc.root) return fallback('Erro', 'Documento do site invalido.');
      const rendered = renderPage(doc, {}, preview ? slug : '');
      return new Response(rendered.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
      });
    } catch (e) {
      console.error('[publisher]', e);
      return fallback('Erro', 'Nao foi possivel carregar este site.');
    }
  },
};
