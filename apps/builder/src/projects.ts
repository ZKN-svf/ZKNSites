// ============================================================
// Projetos, páginas, documentos, versões e publicação
// ============================================================
import type { Env } from './env';
import type { PageDocument, ElementNode } from '../../../packages/shared/src/types';
import { json, err, uid, now, slugify, audit, getIp } from './lib';
import { renderPage } from '../../../packages/shared/src/render';

const PLAN_LIMITS: Record<string, number> = { free: 2, pro: 25, business: 1000 };

function statePageId(body: any, pages: any[]): string {
  if (body.pageId && pages.some(p => p.id === body.pageId)) return body.pageId;
  const home = pages.find(p => p.is_home);
  return home ? home.id : (pages[0]?.id || '');
}

function blankDoc(): PageDocument {
  const root: ElementNode = {
    id: 'root', type: 'root', name: 'Página', styles: {}, children: [
      { id: uid('n_'), type: 'header', name: 'Cabeçalho', styles: { padding: { desktop: '24px' }, display: { desktop: 'flex' }, justifyContent: { desktop: 'space-between' } }, children: [
        { id: uid('n_'), type: 'heading', name: 'Logo', text: 'Minha Marca', styles: { fontSize: { desktop: '24px' }, fontWeight: { desktop: '800' } } },
        { id: uid('n_'), type: 'menu', name: 'Menu', text: 'Início  Sobre  Contato', styles: { display: { desktop: 'flex' }, gap: { desktop: '20px' } } },
      ] },
      { id: uid('n_'), type: 'section', name: 'Seção', styles: { padding: { desktop: '80px 24px' }, textAlign: { desktop: 'center' } }, children: [
        { id: uid('n_'), type: 'heading', name: 'Título', text: 'Bem-vindo ao seu site', styles: { fontSize: { desktop: '48px' }, fontWeight: { desktop: '800' }, marginBottom: { desktop: '16px' } } },
        { id: uid('n_'), type: 'text', name: 'Texto', text: 'Edite este texto no painel à direita.', styles: { fontSize: { desktop: '18px' }, color: { desktop: '#555' } } },
        { id: uid('n_'), type: 'button', name: 'Botão', text: 'Saiba mais', href: '#', styles: { background: { desktop: '#0067ff' }, color: { desktop: '#fff' }, padding: { desktop: '12px 24px' }, borderRadius: { desktop: '8px' }, marginTop: { desktop: '24px' }, display: { desktop: 'inline-block' } } },
      ] },
      { id: uid('n_'), type: 'footer', name: 'Rodapé', text: '© 2026 Minha Marca', styles: { padding: { desktop: '32px 24px' }, textAlign: { desktop: 'center' }, background: { desktop: '#0b1220' }, color: { desktop: '#fff' } } },
    ],
  };
  return { version: 1, root, meta: { title: 'Meu site' } };
}

export async function handleProjects(path: string, method: string, req: Request, env: Env, body: any, user: any): Promise<Response | null> {
  const q = new URL(req.url).searchParams;

  // LISTAR
  if (path === '/projects' && method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT p.*, (SELECT COUNT(*) FROM pages pg WHERE pg.project_id = p.id) AS page_count,
              (SELECT d.document FROM page_documents d JOIN pages pg2 ON pg2.id = d.page_id WHERE pg2.project_id = p.id AND pg2.is_home = 1 LIMIT 1) AS home_document
       FROM projects p WHERE p.user_id = ? ORDER BY p.last_edited_at DESC`
    ).bind(user.id).all<any>();
    return json({ ok: true, projects: rows.results || [] });
  }

  // CRIAR
  if (path === '/projects' && method === 'POST') {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').bind(user.id).first<any>();
    const limite = PLAN_LIMITS[user.plan] || 2;
    if ((count?.n || 0) >= limite) {
      return err(`Seu plano ${user.plan} permite até ${limite} projeto(s). Faça upgrade para criar mais.`, 403, 'PLAN_LIMIT');
    }
    const name = String(body.name || 'Meu site').trim().slice(0, 80);
    let slug = slugify(body.slug || name);
    // garante unicidade global do subdomínio
    const taken = await env.DB.prepare('SELECT id FROM projects WHERE slug = ?').bind(slug).first();
    if (taken) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

    const id = uid('p_'), pageId = uid('pg_');
    const doc = body.from_template
      ? await env.DB.prepare('SELECT document FROM templates WHERE id = ? AND active = 1').bind(body.from_template).first<any>()
      : null;
    const initialDoc: PageDocument = doc?.document ? JSON.parse(doc.document) : blankDoc();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO projects (id,user_id,name,slug,description,status,plan,last_edited_at,created_at,seo_title)
         VALUES (?,?,?,?,?,'draft',?,?,?,?)`
      ).bind(id, user.id, name, slug, String(body.description || ''), user.plan, now(), now(), name),
      env.DB.prepare(
        `INSERT INTO pages (id,project_id,name,slug,is_home,order_index,created_at,updated_at) VALUES (?,?,?,'home',1,0,?,?)`
      ).bind(pageId, id, 'Home', now(), now()),
      env.DB.prepare('INSERT INTO page_documents (page_id,document,updated_at) VALUES (?,?,?)')
        .bind(pageId, JSON.stringify(initialDoc), now()),
      env.DB.prepare(
        'INSERT INTO versions (id,project_id,label,document,pages_snapshot,created_at) VALUES (?,?,?,?,?,?)'
      ).bind(uid('v_'), id, 'Versão inicial', JSON.stringify(initialDoc), JSON.stringify([{ id: pageId, name: 'Home', slug: 'home' }]), now()),
    ]);
    await audit(env, user.id, 'project.create', 'project', id, { name, slug }, getIp(req));
    return json({ ok: true, project: { id, name, slug, status: 'draft' } });
  }

  // BUSCAR UM
  const mProject = path.match(/^\/projects\/([\w-]+)$/);
  if (mProject && method === 'GET') {
    const id = mProject[1];
    const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).first<any>();
    if (!p) return err('Projeto não encontrado.', 404);
    const pages = await env.DB.prepare('SELECT * FROM pages WHERE project_id = ? ORDER BY order_index').bind(id).all<any>();
    const documents: Record<string, string> = {};
    for (const pg of pages.results || []) {
      const d = await env.DB.prepare('SELECT document FROM page_documents WHERE page_id = ?').bind(pg.id).first<any>();
      documents[pg.id] = d?.document || JSON.stringify(blankDoc());
    }
    return json({ ok: true, project: p, pages: pages.results || [], documents });
  }

  // RENOMEAR / ATUALIZAR
  if (mProject && method === 'PUT') {
    const id = mProject[1];
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const fields: string[] = [], vals: any[] = [];
    for (const k of ['name', 'description', 'seo_title', 'seo_description', 'favicon', 'analytics_id', 'custom_code_head', 'custom_code_body']) {
      if (body[k] !== undefined) { fields.push(`${k} = ?`); vals.push(String(body[k]).slice(0, 5000)); }
    }
    if (fields.length) {
      fields.push('last_edited_at = ?'); vals.push(now()); vals.push(id);
      await env.DB.prepare(`UPDATE projects SET ${fields.join(',')} WHERE id = ?`).bind(...vals).run();
    }
    return json({ ok: true });
  }

  // EXCLUIR
  if (mProject && method === 'DELETE') {
    const id = mProject[1];
    const r = await env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    if (!r.meta.changes) return err('Projeto não encontrado.', 404);
    await audit(env, user.id, 'project.delete', 'project', id, {}, getIp(req));
    return json({ ok: true });
  }

  // DUPLICAR
  const mDup = path.match(/^\/projects\/([\w-]+)\/duplicate$/);
  if (mDup && method === 'POST') {
    const orig = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(mDup[1], user.id).first<any>();
    if (!orig) return err('Projeto não encontrado.', 404);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?').bind(user.id).first<any>();
    if ((count?.n || 0) >= (PLAN_LIMITS[user.plan] || 2)) return err('Limite do plano atingido.', 403, 'PLAN_LIMIT');
    const id = uid('p_');
    let slug = `${orig.slug}-copy`;
    if (await env.DB.prepare('SELECT id FROM projects WHERE slug = ?').bind(slug).first()) slug += `-${Math.random().toString(36).slice(2, 5)}`;
    await env.DB.prepare(
      `INSERT INTO projects (id,user_id,name,slug,description,status,plan,last_edited_at,created_at,seo_title)
       VALUES (?,?,?,?,?,'draft',?,?,?,?)`
    ).bind(id, user.id, `${orig.name} (cópia)`, slug, orig.description, user.plan, now(), now(), orig.seo_title).run();
    const pages = await env.DB.prepare('SELECT * FROM pages WHERE project_id = ?').bind(orig.id).all<any>();
    for (const pg of pages.results || []) {
      const newPage = uid('pg_');
      await env.DB.prepare('INSERT INTO pages (id,project_id,name,slug,is_home,order_index,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)')
        .bind(newPage, id, pg.name, pg.slug, pg.is_home, pg.order_index, now(), now()).run();
      const d = await env.DB.prepare('SELECT document FROM page_documents WHERE page_id = ?').bind(pg.id).first<any>();
      if (d) await env.DB.prepare('INSERT INTO page_documents (page_id,document,updated_at) VALUES (?,?,?)').bind(newPage, d.document, now()).run();
    }
    return json({ ok: true, project: { id, slug } });
  }

  // CRIAR PÁGINA
  const mNewPage = path.match(/^\/projects\/([\w-]+)\/pages$/);
  if (mNewPage && method === 'POST') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mNewPage[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const name = String(body.name || 'Nova página').slice(0, 80);
    let slug = slugify(name);
    const exists = await env.DB.prepare('SELECT id FROM pages WHERE project_id=? AND slug=?').bind(mNewPage[1], slug).first();
    if (exists) slug += '-' + Math.random().toString(36).slice(2, 5);
    const pageId = uid('pg_');
    const doc: PageDocument = {
      version: 1, meta: { title: name },
      root: {
        id: 'root', type: 'root', name: 'Página', styles: {}, children: [
          { id: uid('n_'), type: 'section', name: 'Seção', styles: { padding: { desktop: '100px 24px' }, textAlign: { desktop: 'center' } }, children: [
            { id: uid('n_'), type: 'heading', name: 'Título', text: name, styles: { fontSize: { desktop: '48px' }, fontWeight: { desktop: '800' } } },
          ] },
        ],
      },
    };
    const maxOrder = await env.DB.prepare('SELECT COALESCE(MAX(order_index),0) AS n FROM pages WHERE project_id=?').bind(mNewPage[1]).first<any>();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO pages (id,project_id,name,slug,is_home,order_index,created_at,updated_at) VALUES (?,?,?,?,0,?,?,?)')
        .bind(pageId, mNewPage[1], name, slug, (maxOrder?.n || 0) + 1, now(), now()),
      env.DB.prepare('INSERT INTO page_documents (page_id,document,updated_at) VALUES (?,?,?)').bind(pageId, JSON.stringify(doc), now()),
    ]);
    return json({ ok: true, page: { id: pageId, name, slug } });
  }

  // EXCLUIR PÁGINA
  const mDelPage = path.match(/^\/projects\/([\w-]+)\/pages\/([\w-]+)$/);
  if (mDelPage && method === 'DELETE') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mDelPage[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const pg = await env.DB.prepare('SELECT * FROM pages WHERE id = ? AND project_id = ?').bind(mDelPage[2], mDelPage[1]).first<any>();
    if (!pg) return err('Página não encontrada.', 404);
    if (pg.is_home) return err('A página inicial não pode ser excluída.', 400);
    const rest = await env.DB.prepare('SELECT id FROM pages WHERE project_id = ? AND id != ? ORDER BY order_index LIMIT 1').bind(mDelPage[1], pg.id).first<any>();
    if (rest) await env.DB.prepare('UPDATE pages SET is_home = 1 WHERE id = ?').bind(rest.id).run();
    await env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(pg.id).run();
    return json({ ok: true, newHomeId: rest?.id || null });
  }

  // SALVAR DOCUMENTO (autosave)
  const mDoc = path.match(/^\/projects\/([\w-]+)\/pages\/([\w-]+)\/document$/);
  if (mDoc && method === 'PUT') {
    const [, pid, pageId] = mDoc;
    const pg = await env.DB.prepare(
      'SELECT p.id FROM pages pg JOIN projects p ON p.id = pg.project_id WHERE pg.id = ? AND pg.project_id = ? AND p.user_id = ?'
    ).bind(pageId, pid, user.id).first();
    if (!pg) return err('Página não encontrada.', 404);
    const doc = body.document;
    if (!doc || typeof doc !== 'object' || !doc.root) return err('Documento inválido.');
    await env.DB.batch([
      env.DB.prepare('INSERT INTO page_documents (page_id,document,updated_at) VALUES (?,?,?) ON CONFLICT(page_id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at')
        .bind(pageId, JSON.stringify(doc), now()),
      env.DB.prepare('UPDATE pages SET updated_at = ? WHERE id = ?').bind(now(), pageId),
      env.DB.prepare('UPDATE projects SET last_edited_at = ? WHERE id = ?').bind(now(), pid),
    ]);
    return json({ ok: true, savedAt: now() });
  }

  // VERSÕES
  const mVer = path.match(/^\/projects\/([\w-]+)\/versions$/);
  if (mVer && method === 'GET') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mVer[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const rows = await env.DB.prepare('SELECT id,label,created_at,published FROM versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').bind(mVer[1]).all();
    return json({ ok: true, versions: rows.results || [] });
  }
  const mVerGet = path.match(/^\/projects\/([\w-]+)\/versions\/([\w-]+)$/);
  if (mVerGet && method === 'GET') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mVerGet[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const v = await env.DB.prepare('SELECT * FROM versions WHERE id = ? AND project_id = ?').bind(mVerGet[2], mVerGet[1]).first();
    if (!v) return err('Versão não encontrada.', 404);
    return json({ ok: true, version: v });
  }
  const mRestore = path.match(/^\/projects\/([\w-]+)\/versions\/([\w-]+)\/restore$/);
  if (mRestore && method === 'POST') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mRestore[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const v = await env.DB.prepare('SELECT * FROM versions WHERE id = ? AND project_id = ?').bind(mRestore[2], mRestore[1]).first<any>();
    if (!v) return err('Versão não encontrada.', 404);
    const doc = JSON.parse(v.document);
    const pages = JSON.parse(v.pages_snapshot);
    for (const pg of pages) {
      await env.DB.prepare('INSERT INTO page_documents (page_id,document,updated_at) VALUES (?,?,?) ON CONFLICT(page_id) DO UPDATE SET document=excluded.document, updated_at=excluded.updated_at')
        .bind(pg.id, JSON.stringify(doc), now()).run();
    }
    await env.DB.prepare('UPDATE projects SET last_edited_at = ? WHERE id = ?').bind(now(), mRestore[1]).run();
    return json({ ok: true });
  }

  // CRIAR VERSÃO MANUAL
  const mSnap = path.match(/^\/projects\/([\w-]+)\/snapshot$/);
  if (mSnap && method === 'POST') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mSnap[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const pages = await env.DB.prepare('SELECT id,name,slug FROM pages WHERE project_id = ?').bind(mSnap[1]).all<any>();
    const d = await env.DB.prepare('SELECT document FROM page_documents WHERE page_id = ?').bind(pages.results?.[0]?.id).first<any>();
    const vid = uid('v_');
    await env.DB.prepare('INSERT INTO versions (id,project_id,label,document,pages_snapshot,created_at) VALUES (?,?,?,?,?,?)')
      .bind(vid, mSnap[1], String(body.label || 'Versão manual'), d?.document || '{}', JSON.stringify(pages.results || []), now()).run();
    return json({ ok: true, versionId: vid });
  }

  // PREVIEW do estado atual do editor (sem publicar)
  const mPrev = path.match(/^\/projects\/([\w-]+)\/preview$/);
  if (mPrev && method === 'POST') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(mPrev[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const doc = body.document as any;
    if (!doc || !doc.root) return err('Documento inválido.');
    // Token opaco e imprevisível, válido por 30 min, ligado ao projeto/usuário.
    const token = uid('prev_') + '_' + mPrev[1];

    const allPages = await env.DB.prepare('SELECT id,name,slug,is_home FROM pages WHERE project_id = ? ORDER BY order_index').bind(mPrev[1]).all<any>();
    const links: Record<string, string> = {};
    for (const pg of allPages.results || []) links[pg.id] = pg.is_home ? 'home' : pg.slug;

    const pageMap: Record<string, any> = {};
    let homeHtml = '';
    for (const pg of allPages.results || []) {
      let pd = doc;
      if (pg.id !== statePageId(body, allPages.results || [])) {
        const dd = await env.DB.prepare('SELECT document FROM page_documents WHERE page_id = ?').bind(pg.id).first<any>();
        if (dd) pd = JSON.parse(dd.document); else continue;
      }
      const rendered = renderPage({
        ...pd,
        meta: { ...pd.meta, title: pd.meta?.title || pg.name },
      }, links, token);
      pageMap[pg.is_home ? 'home' : pg.slug] = { html: rendered.html, name: pg.name, isHome: !!pg.is_home };
      if (pg.is_home) homeHtml = rendered.html;
    }
    if (!homeHtml) {
      homeHtml = renderPage(doc, links, token).html;
      pageMap.home = { html: homeHtml, name: 'Home', isHome: true };
    }

    await env.PUBLISHED.put(`preview:${token}`, JSON.stringify({
      html: homeHtml, ts: now(), projectId: mPrev[1], userId: user.id, pages: pageMap,
    }), { expirationTtl: 1800 });
    const base = env.PUBLISH_PREVIEW_URL || 'https://zknsites-publisher.gabrielrobin63.workers.dev/?preview=';
    return json({ ok: true, url: `${base}${token}`, expiresIn: 1800 });
  }

  // PUBLICAR / DESPUBLICAR
  const mPub = path.match(/^\/projects\/([\w-]+)\/publish$/);
  if (mPub && method === 'POST') {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(mPub[1], user.id).first<any>();
    if (!p) return err('Projeto não encontrado.', 404);
    const pages = await env.DB.prepare('SELECT id,name,slug,is_home FROM pages WHERE project_id = ? ORDER BY order_index').bind(p.id).all<any>();
    const first = pages.results?.[0]?.id;
    const d = first ? await env.DB.prepare('SELECT document FROM page_documents WHERE page_id = ?').bind(first).first<any>() : null;
    const doc = d?.document || '{}';
    const vid = uid('v_');
    // Enquanto o domínio não estiver ativo, usa token opaco no publisher.
    const previewToken = uid('prev_') + '_' + p.slug;
    const url = env.PUBLISH_SITE_URL
      ? `${env.PUBLISH_SITE_URL}${p.slug}`
      : env.PUBLISH_PREVIEW_URL
        ? `${env.PUBLISH_PREVIEW_URL}${previewToken}`
        : `https://${p.slug}.${env.PUBLISH_BASE_DOMAIN}/`;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO versions (id,project_id,label,document,pages_snapshot,created_at,published) VALUES (?,?,?,?,?,?,1)')
        .bind(vid, p.id, `Publicação ${new Date().toLocaleString('pt-BR')}`, doc, JSON.stringify(pages.results || []), now()),
      env.DB.prepare("UPDATE projects SET status='published', published_at=?, last_edited_at=? WHERE id=?").bind(now(), now(), p.id),
      env.DB.prepare('INSERT INTO publications (id,project_id,version_id,url,published_at) VALUES (?,?,?,?,?)')
        .bind(uid('pub_'), p.id, vid, url, now()),
      env.DB.prepare('UPDATE versions SET published = 0 WHERE project_id = ? AND id != ?').bind(p.id, vid),
    ]);
    // publica no KV: uma entrada por página + índice do site
    const pageLinks: Record<string, string> = {};
    for (const pg of pages.results || []) {
      pageLinks[pg.id] = pg.is_home ? '' : `${pg.slug}`;
    }
    const parsedDoc = JSON.parse(doc);
    const siteData: any = {
      projectId: p.id, slug: p.slug, name: p.name, doc: parsedDoc,
      meta: { title: p.seo_title || p.name, description: p.seo_description || p.description, favicon: p.favicon },
      publishedAt: now(), versionId: vid,
      pages: {},
    };
    for (const pg of pages.results || []) {
      const dd = await env.DB.prepare('SELECT document FROM page_documents WHERE page_id = ?').bind(pg.id).first<any>();
      if (!dd) continue;
      const pd = JSON.parse(dd.document);
      const rendered = renderPage({
        ...pd,
        meta: {
          ...pd.meta,
          title: pd.meta?.title || (pg.is_home ? (p.seo_title || p.name) : `${pg.name} — ${p.name}`),
          description: pd.meta?.description || p.seo_description || p.description,
          favicon: p.favicon || pd.meta?.favicon,
        },
      }, pageLinks);
      siteData.pages[pg.slug] = { html: rendered.html, name: pg.name, isHome: !!pg.is_home };
      if (pg.is_home) siteData.html = rendered.html;
    }
    await env.PUBLISHED.put(`site:${p.slug}`, JSON.stringify(siteData));
    if (env.PUBLISH_PREVIEW_URL) {
      await env.PUBLISHED.put(`preview:${previewToken}`, JSON.stringify(siteData));
    }
    if (p.custom_domain && p.domain_verified) {
      await env.PUBLISHED.put(`domain:${p.custom_domain}`, p.slug);
    }
    await audit(env, user.id, 'project.publish', 'project', p.id, { url }, getIp(req));
    return json({ ok: true, url });
  }

  if (mPub && method === 'DELETE') {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(mPub[1], user.id).first<any>();
    if (!p) return err('Projeto não encontrado.', 404);
    await env.DB.prepare("UPDATE projects SET status='draft' WHERE id = ?").bind(p.id).run();
    await env.DB.prepare('UPDATE publications SET unpublished_at = ? WHERE project_id = ? AND unpublished_at IS NULL').bind(now(), p.id).run();
    await env.PUBLISHED.delete(`site:${p.slug}`);
    if (p.custom_domain) await env.PUBLISHED.delete(`domain:${p.custom_domain}`);
    return json({ ok: true });
  }

  // DOMÍNIO PRÓPRIO
  const mDom = path.match(/^\/projects\/([\w-]+)\/domain$/);
  if (mDom && method === 'POST') {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(mDom[1], user.id).first<any>();
    if (!p) return err('Projeto não encontrado.', 404);
    if (user.plan === 'free') return err('Domínios próprios exigem plano PRO.', 403, 'PLAN_LIMIT');
    const domain = String(body.domain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '');
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) return err('Domínio inválido.');
    const token = uid('verify_').slice(0, 24);
    await env.DB.prepare('UPDATE projects SET custom_domain=?, domain_verified=0, domain_verification_token=? WHERE id=?')
      .bind(domain, token, p.id).run();
    return json({
      ok: true,
      instructions: [
        `Crie um registro CNAME: ${domain} → ${p.slug}.${env.PUBLISH_BASE_DOMAIN}`,
        `Ou adicione o TXT: _zknsites.${domain} = ${token}`,
        'Depois clique em "Verificar domínio".',
      ],
      token,
    });
  }

  if (mDom && method === 'PUT') {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(mDom[1], user.id).first<any>();
    if (!p || !p.custom_domain) return err('Domínio não configurado.', 404);
    // Verificação real via DNS-over-HTTPS (Cloudflare DoH)
    let verificado = false;
    try {
      const resp = await fetch(`https://cloudflare-dns.com/dns-query?name=${p.custom_domain}&type=CNAME`,
        { headers: { accept: 'application/dns-json' } });
      const data = await resp.json() as any;
      const target = `${p.slug}.${env.PUBLISH_BASE_DOMAIN}`;
      verificado = (data.Answer || []).some((a: any) => String(a.data || '').replace(/\.$/, '') === target);
    } catch (e) { console.error('[dns]', e); }
    if (!verificado) {
      try {
        const resp = await fetch(`https://cloudflare-dns.com/dns-query?name=_zknsites.${p.custom_domain}&type=TXT`,
          { headers: { accept: 'application/dns-json' } });
        const data = await resp.json() as any;
        verificado = (data.Answer || []).some((a: any) => String(a.data || '').includes(p.domain_verification_token));
      } catch {}
    }
    if (!verificado) return err('Domínio ainda não verificado. Aguarde a propagação DNS (pode levar até 48h).', 400, 'DNS_PENDING');
    await env.DB.prepare('UPDATE projects SET domain_verified=1 WHERE id = ?').bind(p.id).run();
    if (p.status === 'published') await env.PUBLISHED.put(`domain:${p.custom_domain}`, p.slug);
    return json({ ok: true, verified: true });
  }

  if (mDom && method === 'DELETE') {
    const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').bind(mDom[1], user.id).first<any>();
    if (!p) return err('Projeto não encontrado.', 404);
    await env.DB.prepare('UPDATE projects SET custom_domain=NULL, domain_verified=0, domain_verification_token=NULL WHERE id=?').bind(p.id).run();
    if (p.custom_domain) await env.PUBLISHED.delete(`domain:${p.custom_domain}`);
    return json({ ok: true });
  }

  // TEMPLATES
  if (path === '/templates' && method === 'GET') {
    const rows = await env.DB.prepare('SELECT id,name,category,description,thumbnail,premium FROM templates WHERE active=1 ORDER BY category,name').all();
    return json({ ok: true, templates: rows.results || [] });
  }

  // FORM SUBMISSIONS
  const mForms = path.match(/^\/projects\/([\w-]+)\/submissions$/);
  if (mForms && method === 'GET') {
    const p = await env.DB.prepare('SELECT id FROM projects WHERE id=? AND user_id=?').bind(mForms[1], user.id).first();
    if (!p) return err('Projeto não encontrado.', 404);
    const rows = await env.DB.prepare('SELECT * FROM form_submissions WHERE project_id=? ORDER BY created_at DESC LIMIT 200').bind(mForms[1]).all();
    return json({ ok: true, submissions: rows.results || [] });
  }

  // ADMIN
  if (path === '/admin/overview' && method === 'GET') {
    if (user.role !== 'admin') return err('Acesso negado.', 403);
    const [u, p, pub, a] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<any>(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM projects').first<any>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM projects WHERE status='published'").first<any>(),
      env.DB.prepare('SELECT COALESCE(SUM(size),0) AS n FROM assets').first<any>(),
    ]);
    return json({ ok: true, users: u?.n, projects: p?.n, published: pub?.n, storageBytes: a?.n });
  }
  if (path === '/admin/users' && method === 'GET') {
    if (user.role !== 'admin') return err('Acesso negado.', 403);
    const rows = await env.DB.prepare('SELECT id,email,name,plan,role,suspended,created_at FROM users ORDER BY created_at DESC LIMIT 500').all();
    return json({ ok: true, users: rows.results || [] });
  }
  const mSusp = path.match(/^\/admin\/users\/([\w-]+)\/suspend$/);
  if (mSusp && method === 'POST') {
    if (user.role !== 'admin') return err('Acesso negado.', 403);
    await env.DB.prepare('UPDATE users SET suspended = ? WHERE id = ?').bind(body.suspended ? 1 : 0, mSusp[1]).run();
    return json({ ok: true });
  }

  return null;
}
