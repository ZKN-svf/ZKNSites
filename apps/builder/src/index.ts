// ============================================================
// ZKNSites API — Workers (núcleo da plataforma)
// ============================================================
import type { Env } from './env';
import { json, err, uid, now, rateLimit, sanitizeHtml, getIp } from './lib';
import { handleAuth, currentUser } from './auth';
import { handleProjects } from './projects';
import { criarCobranca, consultarPagamento, confirmarPagamento, gatewayConfigurado } from './payments';

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
        const publicUrl = `https://zknsites-publisher.gabrielrobin63.workers.dev/${key}`;
        return json({ ok: true, url: publicUrl, key, size: bytes.length });
      }

      if (path === '/assets' && method === 'GET') {
        const u = await currentUser(env, request);
        if (!u) return err('Não autorizado.', 401);
        const rows = await env.DB.prepare('SELECT * FROM assets WHERE user_id=? ORDER BY created_at DESC LIMIT 200').bind(u.id).all();
        return json({ ok: true, assets: rows.results || [] });
      }

      // Agente de IA — ajuda a construir o site dentro do editor
      if (path === '/ai/assist' && method === 'POST') {
        const u = await currentUser(env, request);
        if (!u) return err('Não autorizado.', 401);
        if (!await rateLimit(env, `ai:${u.id}`, 40, 3600)) return err('Limite de consultas de IA atingido. Tente em uma hora.', 429);
        const message = String(body.message || '').trim().slice(0, 1200);
        if (!message) return err('Escreva uma mensagem.', 400);
        const context = body.context && typeof body.context === 'object' ? body.context : {};
        const elementos = Array.isArray(context.elements) ? context.elements.slice(0, 14) : [];

        const system = [
          'Você é o EXECUTOR de ações do editor visual ZKNSites.',
          'Você NÃO dá conselhos, NÃO explica o que poderia ser feito e NÃO faz perguntas. Você SEMPRE executa o pedido do usuário no site.',
          'Responda com UM ÚNICO objeto JSON válido. Nada antes, nada depois. Sem markdown, sem blocos de código, sem texto extra.',
          'O objeto deve ter: "reply" (confirmação curta em português, máx 10 palavras) e "action" com uma das ações abaixo.',
          'AÇÕES:',
          '{"reply":"...","action":"add","component":"heading|text|button|link|image|section|divider|spacer","text":"texto do elemento","src":"URL da imagem se image"}',
          '{"reply":"...","action":"text","text":"novo texto"}',
          '{"reply":"...","action":"color","color":"#RRGGBB"}',
          '{"reply":"...","action":"pageBg","color":"#RRGGBB"}',
          '{"reply":"...","action":"fontSize","size":"48px"}',
          '{"reply":"...","action":"rename","name":"novo nome"}',
          '{"reply":"...","action":"delete"}',
          'REGRAS:',
          '- Se o usuário pedir para criar/colocar/adicionar algo, use "add" e preencha o texto exato pedido.',
          '- Se pedir para mudar um texto, use "text" com o texto exato pedido.',
          '- Se pedir uma cor sem dizer onde, use "color" para o elemento selecionado (ou "pageBg" se falar do fundo/página).',
          '- Converta nomes de cores para hexadecimal (azul=#2563eb, vermelho=#dc2626, verde=#16a34a, amarelo=#eab308, preto=#000000, branco=#ffffff).',
          '- Se o pedido for ambíguo, escolha a ação mais útil e execute. Nunca responda só com explicação.',
          `Contexto: projeto "${String(context.projectName || 'sem nome').slice(0, 80)}". Elementos: ${JSON.stringify(elementos)}.`,
          `Dispositivo: ${String(context.device || 'desktop')}.`,
        ].join('\n');

        try {
          const resp = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: message },
            ],
            max_tokens: 300,
            temperature: 0.2,
          });
          const rr: any = resp;
          let bruto = String(
            rr?.choices?.[0]?.message?.content ??
            rr?.choices?.[0]?.text ??
            (typeof rr?.response === 'string' ? rr.response : '') ??
            ''
          ).trim();
          bruto = bruto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
          const ini = bruto.indexOf('{'), fim = bruto.lastIndexOf('}');
          if (ini >= 0 && fim > ini) bruto = bruto.slice(ini, fim + 1);
          let acao: any = null;
          try { acao = JSON.parse(bruto); } catch { acao = null; }
          const permitidas = ['add', 'text', 'color', 'pageBg', 'fontSize', 'rename', 'delete'];
          if (!acao || !permitidas.includes(String(acao.action))) {
            // fallback: se o modelo não obedeceu, extrai um texto simples da mensagem
            const texto = message.replace(/^(coloque|adicione|adicionar|crie|escreva|mude o texto para|troque o texto para)\s*/i, '').slice(0, 120);
            acao = { reply: 'Feito!', action: 'add', component: 'text', text: texto };
          }
          return json({
            ok: true,
            action: acao,
            reply: String(acao.reply || 'Feito!').slice(0, 120),
          });
        } catch (e: any) {
          console.error('[AI]', e);
          return err('O assistente está temporariamente indisponível.', 503);
        }
      }

      // Webhook da Nexas (público) — confirma pagamento e libera o site
      if (path === '/webhook/nexas' && method === 'POST') {
        const externalId = String(body.external_id || body.transactionId || body.externalId || '');
        if (!externalId) return err('Sem external_id', 400);
        const ok = await confirmarPagamento(env, externalId);
        return json({ ok: true, liberado: ok });
      }

      // Checkout / status de pagamento
      if (path === '/payments/checkout' && method === 'POST') {
        const u = await currentUser(env, request);
        if (!u) return err('Não autorizado.', 401);
        if (!gatewayConfigurado(env)) return err('Gateway de pagamento não configurado.', 503);
        const projectId = String(body.projectId || '');
        const p = await env.DB.prepare('SELECT * FROM projects WHERE id=? AND user_id=?').bind(projectId, u.id).first<any>();
        if (!p) return err('Projeto não encontrado.', 404);
        const preco = Number(body.amount || 29.9);
        if (!(preco >= 5 && preco <= 500)) return err('Valor inválido.');
        const r = await criarCobranca(env, { amount: preco, projectId, userEmail: u.email, userName: u.name });
        if (!r.ok) return err(r.mensagem || 'Erro ao gerar cobrança.', 502);
        return json({ ok: true, pixCode: r.pixCode, pixImage: r.pixImage, identifier: r.identifier, amount: preco });
      }
      if (path === '/payments/status' && method === 'GET') {
        const u = await currentUser(env, request);
        if (!u) return err('Não autorizado.', 401);
        const id = new URL(request.url).searchParams.get('external_id') || '';
        if (!id) return err('Sem external_id', 400);
        const row = await env.DB.prepare('SELECT * FROM payments WHERE external_id=? AND user_email=?').bind(id, u.email).first<any>();
        if (!row) return err('Pagamento não encontrado.', 404);
        let pago = row.status === 'PAID';
        if (!pago) {
          pago = await confirmarPagamento(env, id);
        }
        return json({ ok: true, pago, status: pago ? 'PAID' : 'PENDING' });
      }
      if (path === '/payments/plans' && method === 'GET') {
        return json({ ok: true, plans: [
          { id: 'pro', name: 'PRO', price: 29.9, description: 'Site publicado, domínio próprio, sem marca d\'água' },
          { id: 'business', name: 'BUSINESS', price: 79.9, description: 'Projetos ilimitados, colaboração e suporte prioritário' },
        ] });
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
