// ============================================================
// ZKNSites API — Workers (núcleo da plataforma)
// ============================================================
import type { Env } from './env';
import { json, err, uid, now, rateLimit, sanitizeHtml, getIp } from './lib';
import { handleAuth, currentUser } from './auth';
import { handleProjects } from './projects';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api/, '');
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
        'Access-Control-Max-Age': '86400',
      } });
    }

    if (path === '/health') return json({ ok: true, service: 'zknsites-api', ts: now() });

    let body: any = {};
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try { body = await request.json(); } catch { body = {}; }
    }

    try {
      // Rotas públicas de autenticação
      const authRes = await handleAuth(path, method, request, env, body);
      if (authRes) return authRes;

      // Envio de formulário de site publicado (público, com rate limit)
      if (path === '/forms/submit' && method === 'POST') {
        const pid = String(body.projectId || '');
        const origin = request.headers.get('Origin') || '';
        if (!await rateLimit(env, `form:${getIp(request)}`, 10, 3600)) return err('Muitos envios. Tente depois.', 429);
        const p = await env.DB.prepare('SELECT id FROM projects WHERE id=? AND status="published"').bind(pid).first();
        if (!p) return err('Formulário indisponível.', 404);
        const data = body.data && typeof body.data === 'object' ? body.data : {};
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(data)) clean[sanitizeHtml(k).slice(0, 60)] = sanitizeHtml(String(v)).slice(0, 2000);
        await env.DB.prepare(
          'INSERT INTO form_submissions (id,project_id,page_id,element_id,data,created_at,ip,user_agent) VALUES (?,?,?,?,?,?,?,?)'
        ).bind(uid('f_'), pid, String(body.pageId || ''), String(body.elementId || ''), JSON.stringify(clean), now(), getIp(request), request.headers.get('User-Agent') || '').run();
        return json({ ok: true, message: 'Mensagem enviada!' });
      }

      // Upload de assets (autenticado)
      if (path === '/assets/upload' && method === 'POST') {
        const u = await currentUser(env, request);
        if (!u) return err('Não autorizado.', 401);
        const file = body.file ? await fetch(body.file).catch(() => null) : null;
        const bytes = body.base64 ? Uint8Array.from(atob(body.base64), c => c.charCodeAt(0)) : null;
        if (!bytes) return err('Arquivo inválido.');
        const max = 10 * 1024 * 1024;
        if (bytes.length > max) return err('Arquivo muito grande (máx 10MB).', 413);
        const mime = String(body.mimeType || 'application/octet-stream').slice(0, 100);
        const key = `u/${u.id}/${uid('a_')}`;
        await env.ASSETS.put(key, bytes, { httpMetadata: { contentType: mime } });
        await env.DB.prepare(
          'INSERT INTO assets (id,user_id,project_id,file_name,r2_key,mime_type,size,created_at) VALUES (?,?,?,?,?,?,?,?)'
        ).bind(uid('as_'), u.id, body.projectId || null, String(body.fileName || 'arquivo').slice(0, 200), key, mime, bytes.length, now()).run();
        const publicUrl = `https://assets.zknsites.com/${key}`;
        return json({ ok: true, url: publicUrl, key, size: bytes.length });
      }

      if (path === '/assets' && method === 'GET') {
        const u = await currentUser(env, request);
        if (!u) return err('Não autorizado.', 401);
        const rows = await env.DB.prepare('SELECT * FROM assets WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(u.id).all();
        return json({ ok: true, assets: rows.results || [] });
      }

      // Todas as rotas de projeto exigem login
      const user = await currentUser(env, request);
      if (!user && path.startsWith('/projects')) return err('Não autorizado.', 401);
      if (!user && path.startsWith('/admin')) return err('Não autorizado.', 401);
      if (!user && path.startsWith('/templates')) return err('Não autorizado.', 401);

      const res = await handleProjects(path, method, request, env, body, user || {});
      if (res) return res;

      return err('Rota não encontrada.', 404, 'NOT_FOUND');
    } catch (e: any) {
      console.error('[API ERROR]', path, e);
      return err('Erro interno: ' + (e?.message || 'desconhecido'), 500, 'INTERNAL');
    }
  },
};
