// ============================================================
// ZKNSites — aplicação frontend (auth, dashboard, editor visual)
// ============================================================
const API = 'https://zknsites-api.gabrielrobin63.workers.dev/api';
const TOKEN_KEY = 'zknsites_token';
const USER_KEY = 'zknsites_user';

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  user: JSON.parse(localStorage.getItem(USER_KEY) || 'null'),
  projects: [],
  templates: [],
  current: null,
  doc: null,
  pageId: null,
  selectedId: null,
  device: 'desktop',
  undo: [],
  redo: [],
  saveTimer: null,
  dirty: false,
  maxZ: 10,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uid = (p = 'n_') => p + Math.random().toString(36).slice(2, 10);
const fmt = (n) => new Date(n).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j; try { j = await r.json(); } catch { j = {}; }
  if (!r.ok) throw new Error(j.message || 'Erro ' + r.status);
  return j;
}
function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function setSession(token, user) {
  state.token = token; state.user = user;
  localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function logout() {
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  state.token = null; state.user = null; render();
}

// ======================= AUTH =======================
function authView(mode = 'login') {
  const isLogin = mode === 'login';
  return `<div class="auth-wrap"><div class="auth-bg"></div><div class="auth-card">
    <div class="brand"><div class="brand-mark">Z</div><span>ZKNSites</span></div>
    <h1>${isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
    <p class="sub">${isLogin ? 'Entre para gerenciar seus sites.' : 'Comece a criar seu primeiro site grátis.'}</p>
    <form id="authForm">
      ${isLogin ? '' : '<label class="field"><span>Nome</span><input id="authName" required placeholder="Seu nome"></label>'}
      <label class="field"><span>E-mail</span><input id="authEmail" type="email" required placeholder="voce@email.com"></label>
      <label class="field"><span>Senha</span><input id="authPass" type="password" required placeholder="Mínimo 8 caracteres"></label>
      <button class="btn primary block" type="submit">${isLogin ? 'Entrar' : 'Criar conta'}</button>
    </form>
    <p class="msg" id="authMsg"></p>
    <div class="auth-links">
      <span>${isLogin ? 'Não tem conta?' : 'Já tem conta?'} <a href="#" id="toggleAuth">${isLogin ? 'Cadastre-se' : 'Entrar'}</a></span>
      <a href="#" id="toggleTheme">Alternar tema</a>
    </div>
  </div></div>`;
}
function bindAuth(mode) {
  $('#toggleAuth').onclick = (e) => { e.preventDefault(); render({ authMode: mode === 'login' ? 'register' : 'login' }); };
  $('#toggleTheme').onclick = (e) => { e.preventDefault(); document.body.classList.toggle('light'); };
  $('#authForm').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('#authMsg'); msg.textContent = 'Aguarde...'; msg.className = 'msg';
    try {
      const body = { email: $('#authEmail').value, password: $('#authPass').value };
      if (mode === 'register') body.name = $('#authName').value;
      const r = await api(mode === 'login' ? '/auth/login' : '/auth/register', 'POST', body);
      setSession(r.token, r.user); render();
    } catch (err) { msg.textContent = err.message; msg.className = 'msg error'; }
  };
}

// ======================= DASHBOARD =======================
const COMPONENTS = [
  ['heading','Título','H'], ['text','Texto','T'], ['image','Imagem','▣'], ['video','Vídeo','▶'],
  ['button','Botão','⬭'], ['link','Link','↗'], ['container','Container','▤'], ['section','Seção','▥'],
  ['grid','Grid','▦'], ['columns','Colunas','▥'], ['card','Card','▢'], ['gallery','Galeria','▧'],
  ['testimonial','Depoimento','❝'], ['form','Formulário','▤'], ['input','Campo','⌨'], ['menu','Menu','☰'],
  ['header','Cabeçalho','▔'], ['footer','Rodapé','▁'], ['icon','Ícone','✦'], ['divider','Divisor','—'],
  ['spacer','Espaço','↕'], ['list','Lista','≡'], ['table','Tabela','▦'], ['select','Select','⌄'],
];
const TEMPLATE_CARDS = [
  ['blank','Em branco','Comece do zero','▢'], ['portfolio','Portfólio','Mostre seu trabalho','◈'],
  ['business','Empresa','Site institucional','▥'], ['restaurant','Restaurante','Cardápio e reservas','▦'],
  ['landing','Landing page','Converta visitantes','↗'], ['blog','Blog','Artigos e conteúdo','▤'],
  ['ecommerce','Loja virtual','Venda produtos','▣'], ['agency','Agência','Serviços criativos','✦'],
];

async function loadDashboard() {
  const ov = $('#selOverlay'); if (ov) ov.remove();
  try {
    const [p, t] = await Promise.all([api('/projects'), api('/templates')]);
    state.projects = p.projects || [];
    state.templates = t.templates || [];
  } catch (e) { toast(e.message); }
  render();
}
function dashboardView() {
  const projects = state.projects;
  const published = projects.filter(p => p.status === 'published').length;
  const limite = { free: 2, pro: 25, business: 1000 }[state.user?.plan] || 2;
  return `<div class="shell">
    <header class="topbar">
      <div class="brand"><div class="brand-mark">Z</div><span>ZKNSites</span></div>
      <span class="badge">${state.user?.plan || 'free'}</span>
      <div class="spacer"></div>
      <button class="btn sm ghost" id="themeBtn">Tema</button>
      <div class="avatar" title="${esc(state.user?.email)}">${(state.user?.name || 'U')[0].toUpperCase()}</div>
      <button class="btn sm ghost" id="logoutBtn">Sair</button>
    </header>
    <main class="container">
      <div class="page-head">
        <div><h1>Meus sites</h1><p>Crie, edite e publique — tudo em um só lugar.</p></div>
        <button class="btn primary" id="newBtn">+ Novo site</button>
      </div>
      <div class="stat-grid">
        <div class="stat"><small>Projetos</small><strong>${projects.length} <span style="font-size:12px;color:var(--muted)">/ ${limite}</span></strong></div>
        <div class="stat"><small>Publicados</small><strong>${published}</strong></div>
        <div class="stat"><small>Rascunhos</small><strong>${projects.length - published}</strong></div>
        <div class="stat"><small>Plano</small><strong style="text-transform:capitalize">${state.user?.plan || 'free'}</strong></div>
      </div>
      <section class="section"><h2>Modelos <small>comece com um template</small></h2>
        <div class="grid-projects">${TEMPLATE_CARDS.map(([id,n,d,i]) => `
          <div class="card-project" data-template="${id}"><div class="thumb"><span class="thumb-icon">${i}</span></div>
          <div class="card-body"><div class="card-title">${n}</div><div class="card-meta">${d}</div></div></div>`).join('')}
        </div>
      </section>
      <section class="section"><h2>Projetos recentes <small>${projects.length} projeto(s)</small></h2>
        ${projects.length ? `<div class="grid-projects">${projects.map(p => `
          <div class="card-project" data-open="${p.id}">
            <div class="thumb"><span class="thumb-icon">▣</span></div>
            <div class="card-body">
              <div class="card-title">${esc(p.name)}</div>
              <div class="card-meta"><span class="badge ${p.status === 'published' ? 'pub' : 'draft'}">${p.status === 'published' ? 'Publicado' : 'Rascunho'}</span><span>${fmt(p.last_edited_at)}</span></div>
              <div style="color:var(--muted);font-size:10px;margin-top:5px">/${esc(p.slug)}</div>
            </div>
            <div class="card-actions">
              <button class="btn sm" data-open_btn="${p.id}">Abrir</button>
              ${p.status === 'published' ? `<a class="btn sm" href="${esc(p.published_url || '#')}" target="_blank">Ver site</a>` : ''}
              <button class="btn sm ghost" data-dup="${p.id}" title="Duplicar">⧉</button>
              <button class="btn sm danger" data-del="${p.id}" title="Excluir">✕</button>
            </div>
          </div>`).join('')}</div>` : `<div class="empty"><h3>Nenhum projeto ainda</h3><p>Crie seu primeiro site acima.</p></div>`}
      </section>
    </main>
  </div>`;
}
function bindDashboard() {
  $('#logoutBtn').onclick = async () => { try { await api('/auth/logout', 'POST'); } catch {} logout(); };
  $('#themeBtn').onclick = () => document.body.classList.toggle('light');
  $('#newBtn').onclick = () => showNewModal();
  $$('[data-template]').forEach(el => el.onclick = () => showNewModal(el.dataset.template));
  $$('[data-open], [data-open_btn]').forEach(el => el.onclick = (e) => {
    e.stopPropagation(); const id = el.dataset.open || el.dataset.open_btn; openEditor(id);
  });
  $$('[data-dup]').forEach(el => el.onclick = async (e) => {
    e.stopPropagation(); try { await api(`/projects/${el.dataset.dup}/duplicate`, 'POST', {}); toast('Projeto duplicado!'); loadDashboard(); } catch (err) { toast(err.message); }
  });
  $$('[data-del]').forEach(el => el.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Excluir este projeto? Esta ação não pode ser desfeita.')) return;
    try { await api(`/projects/${el.dataset.del}`, 'DELETE'); toast('Projeto excluído.'); loadDashboard(); } catch (err) { toast(err.message); }
  });
}
function showNewModal(template = 'blank') {
  const div = document.createElement('div');
  div.className = 'modal';
  div.innerHTML = `<div class="modal-card">
    <h2>Criar novo site</h2><p class="sub">Escolha um nome para seu projeto.</p>
    <form id="newForm">
      <label class="field"><span>Nome do site</span><input id="newName" required placeholder="Minha Empresa" autofocus></label>
      <label class="field"><span>Modelo</span><select id="newTemplate">
        ${TEMPLATE_CARDS.map(([id,n]) => `<option value="${id}" ${id === template ? 'selected' : ''}>${n}</option>`).join('')}
      </select></label>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn primary" type="submit">Criar projeto</button>
        <button class="btn ghost" type="button" id="cancelNew">Cancelar</button>
      </div>
    </form></div>`;
  document.body.appendChild(div);
  $('#cancelNew', div).onclick = () => div.remove();
  $('#newForm', div).onsubmit = async (e) => {
    e.preventDefault();
    const t = $('#newTemplate', div).value;
    try {
      const r = await api('/projects', 'POST', { name: $('#newName', div).value, from_template: t === 'blank' ? undefined : t });
      div.remove(); toast('Projeto criado!'); openEditor(r.project.id);
    } catch (err) { toast(err.message); }
  };
  $('#newName', div).focus();
}

// ======================= EDITOR =======================
async function openEditor(id) {
  try {
    const r = await api(`/projects/${id}`);
    state.current = r.project;
    state.pageId = r.pages[0].id;
    state.doc = JSON.parse(r.documents[state.pageId]);
    state.current.pages = r.pages; state.current.documents = r.documents;
    state.selectedId = null; state.undo = []; state.redo = []; state.maxZ = 10;
    state.editor = true;
    render({ editor: true });
    bindEditor(); renderCanvas(); renderProperties();
  } catch (e) { toast(e.message); }
}
function findNode(root, id, parent = null) {
  if (root.id === id) return { node: root, parent };
  for (const c of root.children || []) {
    const f = findNode(c, id, root);
    if (f) return f;
  }
  return null;
}
function snapshot() {
  state.undo.push(JSON.stringify(state.doc));
  if (state.undo.length > 60) state.undo.shift();
  state.redo = [];
  state.dirty = true;
  scheduleSave();
}
function scheduleSave() {
  clearTimeout(state.saveTimer);
  $('#saveStatus') && ($('#saveStatus').textContent = 'Salvando...');
  state.saveTimer = setTimeout(async () => {
    try {
      await api(`/projects/${state.current.id}/pages/${state.pageId}/document`, 'PUT', { document: state.doc });
      state.dirty = false;
      $('#saveStatus') && ($('#saveStatus').textContent = '✓ Salvo');
    } catch (e) { toast('Erro ao salvar: ' + e.message); }
  }, 900);
}
function undo() {
  if (!state.undo.length) return;
  state.redo.push(JSON.stringify(state.doc));
  state.doc = JSON.parse(state.undo.pop());
  state.selectedId = null;
  renderCanvas(); renderProperties(); scheduleSave();
}
function redo() {
  if (!state.redo.length) return;
  state.undo.push(JSON.stringify(state.doc));
  state.doc = JSON.parse(state.redo.pop());
  state.selectedId = null;
  renderCanvas(); renderProperties(); scheduleSave();
}
// Atalhos de teclado (Ctrl+Z desfazer, Ctrl+Y / Ctrl+Shift+Z refazer)
document.addEventListener('keydown', (e) => {
  if (!state.editor || !state.doc) return;
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo(); else undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault(); redo();
  }
});
function nodeHTML(n) {
  if (n.hidden) return '';
  const tag = n.tag || ({ heading:'h2', text:'p', image:'img', button:'button', link:'a', container:'div', section:'section', header:'header', footer:'footer', card:'article', menu:'nav', divider:'hr', spacer:'div', grid:'div', columns:'div', column:'div', gallery:'div', testimonial:'blockquote', form:'form', input:'input', list:'ul', table:'table', icon:'span' }[n.type] || 'div');
  const st = n.styles || {};
  const pick = (bp) => {
    const parts = [];
    for (const [k, css] of Object.entries({
      width:'width',height:'height',padding:'padding',margin:'margin',background:'background',color:'color',
      fontSize:'font-size',fontWeight:'font-weight',textAlign:'text-align',display:'display',gap:'gap',
      borderRadius:'border-radius',border:'border',boxShadow:'box-shadow',opacity:'opacity',textTransform:'text-transform',
      gridTemplateColumns:'grid-template-columns',flexDirection:'flex-direction',justifyContent:'justify-content',
      alignItems:'align-items',minHeight:'min-height',maxWidth:'max-width',lineHeight:'line-height',letterSpacing:'letter-spacing',
      position:'position',left:'left',top:'top',zIndex:'z-index',
    })) {
      let v = st[k];
      if (v && typeof v === 'object') v = v[bp] ?? v.desktop;
      if (v !== undefined && v !== '') parts.push(`${css}:${v}`);
    }
    return parts.join(';');
  };
  const style = pick('desktop') + (state.device === 'tablet' ? ';' + pick('tablet') : '') + (state.device === 'mobile' ? ';' + pick('mobile') : '');
  const attrs = `data-zn-id="${n.id}" class="el" style="${esc(style)}"`;
  const inner = (n.children || []).map(nodeHTML).join('') || (n.html || esc(n.text || ''));
  if (['img','input','hr'].includes(tag)) return `<${tag} ${attrs} ${n.src ? `src="${esc(n.src)}"` : ''} ${n.alt ? `alt="${esc(n.alt)}"` : ''}>`;
  if (tag === 'a') return `<a ${attrs} href="${esc(n.href || '#')}">${inner}</a>`;
  return `<${tag} ${attrs}>${inner}</${tag}>`;
}
function getStyleVal(n, key, bp = state.device) {
  const v = n.styles?.[key];
  return v && typeof v === 'object' ? (v[bp] ?? v.desktop ?? '') : (v ?? '');
}
function setStyleVal(n, key, val, bp = state.device) {
  n.styles = n.styles || {};
  const cur = n.styles[key];
  if (cur && typeof cur === 'object') cur[bp] = val;
  else n.styles[key] = { [bp]: val };
}
function px(v) { return parseFloat(String(v || '').replace('px', '')) || 0; }

// Overlay flutuante de seleção: move e redimensiona com o mouse
let moverSelecionado = null;
function updateSelectionOverlay() {
  const old = $('#selOverlay'); if (old) old.remove();
  const canvas = $('#canvas');
  const found = state.selectedId ? findNode(state.doc.root, state.selectedId) : null;
  if (!found || !canvas) return;
  // A Página é o fundo fixo: nunca é arrastada nem redimensionada.
  if (found.node === state.doc.root || found.node.id === 'root') return;
  const target = canvas.querySelector(`[data-zn-id="${state.selectedId}"]`);
  if (!target) return;

  const overlay = document.createElement('div');
  overlay.id = 'selOverlay';
  overlay.className = 'sel-overlay';
  // No body com position:fixed — o overflow do .ed-center cortaria as alças
  // quando o elemento chega perto do painel lateral.
  document.body.appendChild(overlay);

  const n = found.node;
  // Cache do retângulo ORIGINAL, capturado antes de qualquer transform.
  // Nunca reler getBoundingClientRect durante o arraste (elemento transformado
  // devolve posições diferentes e causa o "pulo").
  const r0 = target.getBoundingClientRect();
  const c0 = canvas.getBoundingClientRect();
  let dx = 0, dy = 0, w0 = r0.width, h0 = r0.height;
  let baseLeft = r0.left - c0.left;
  let baseTop = r0.top - c0.top;

  // Cria tag e alças UMA VEZ (recriá-las a cada frame quebra os handlers)
  const tag = document.createElement('div');
  tag.className = 'sel-tag'; tag.textContent = n.name || n.type;
  overlay.appendChild(tag);
  ['nw','ne','sw','se'].forEach(pos => {
    const h = document.createElement('div');
    h.className = 'sel-handle ' + pos; h.dataset.handle = pos;
    overlay.appendChild(h);
  });
  function draw() {
    // -1px compensa a borda (box-sizing). Coordenadas de viewport.
    overlay.style.left = (r0.left + dx - 1) + 'px';
    overlay.style.top = (r0.top + dy - 1) + 'px';
    overlay.style.width = w0 + 'px';
    overlay.style.height = h0 + 'px';
  }
  draw();

  // MOVER: pela tag OU arrastando o próprio elemento (ver handler no canvas)
  moverSelecionado = (e) => {
    if (n === state.doc.root || n.id === 'root') return;
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('.sel-handle')) return; // alça cuida do resize
    e.preventDefault(); e.stopPropagation();
    // Elementos em fluxo normal devem continuar no fluxo — virar absolute faz
    // todo o conteúdo abaixo subir (era o bug do Hero).
    const eraAbsoluto = String(getStyleVal(n, 'position')) === 'absolute' ||
      getComputedStyle(target).position === 'absolute';
    const startX = e.clientX, startY = e.clientY;
    const dx0 = dx, dy0 = dy;
    let moved = false;
    const move = (ev) => {
      const ndx = dx0 + (ev.clientX - startX);
      const ndy = dy0 + (ev.clientY - startY);
      if (!moved && Math.abs(ndx) + Math.abs(ndy) < 3) return; // ignora clique simples
      moved = true;
      dx = ndx; dy = ndy;
      // O wrapper está escalado: compensa para o mouse andar 1:1 na tela
      const sv = state.canvasScale || 1;
      target.style.transform = `translate3d(${dx / sv}px,${dy / sv}px,0)`;
      draw();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) { target.style.transform = ''; return; }
      // Posição visual FINAL (com o transform ainda aplicado).
      const rFinal = target.getBoundingClientRect();
      target.style.transform = '';
      const s = state.canvasScale || 1;
      snapshot();
      if (eraAbsoluto) {
        // Já era absolute: converte para as coordenadas do offsetParent.
        const parent = target.offsetParent || canvas;
        const pr = parent.getBoundingClientRect();
        const leftFinal = Math.round((rFinal.left - pr.left - parent.clientLeft) / s);
        const topFinal = Math.round((rFinal.top - pr.top - parent.clientTop) / s);
        setStyleVal(n, 'left', leftFinal + 'px');
        setStyleVal(n, 'top', topFinal + 'px');
      } else {
        // Estava no fluxo: relative preserva o espaço e nada "pula" abaixo.
        setStyleVal(n, 'position', 'relative');
        setStyleVal(n, 'left', Math.round(dx / s) + 'px');
        setStyleVal(n, 'top', Math.round(dy / s) + 'px');
      }
      setStyleVal(n, 'margin', '0');
      setStyleVal(n, 'width', Math.round(rFinal.width / s) + 'px');
      dx = 0; dy = 0;
      applyLiveStyle(target, n);
      requestAnimationFrame(() => ajustarAltura());
      updateSelectionOverlay();
      renderProperties();
      scheduleSave();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  tag.onpointerdown = moverSelecionado;

  // REDIMENSIONAR com as alças
  $$('.sel-handle', overlay).forEach(h => {
    h.onpointerdown = (e) => {
      if (n === state.doc.root || n.id === 'root') return;
      e.preventDefault(); e.stopPropagation();
      snapshot();
      const pos = h.dataset.handle;
      const startX = e.clientX, startY = e.clientY;
      const sv = state.canvasScale || 1;
      // w0/h0 são visuais (overlay fora do wrapper escalado); o documento usa o espaço base
      let docW = w0 / sv, docH = h0 / sv;
      const l0 = px(getStyleVal(n, 'left')) || 0, t0 = px(getStyleVal(n, 'top')) || 0;
      const ehTexto = ['heading', 'text', 'button', 'link'].includes(n.type) || !!n.text;
      const fs0 = ehTexto ? (px(getStyleVal(n, 'fontSize')) || parseFloat(getComputedStyle(target).fontSize) || 16) : 0;
      const hInicial = docH;
      n.styles.position = { [state.device]: 'absolute' };
      const move = (ev) => {
        const mdx = (ev.clientX - startX) / sv, mdy = (ev.clientY - startY) / sv;
        let nw = docW, nh = docH, nl = l0, nt = t0;
        if (pos.includes('e')) nw = Math.max(20, docW + mdx);
        if (pos.includes('s')) nh = Math.max(20, docH + mdy);
        if (pos.includes('w')) { nw = Math.max(20, docW - mdx); nl = l0 + mdx; }
        if (pos.includes('n')) { nh = Math.max(20, docH - mdy); nt = t0 + mdy; }
        setStyleVal(n, 'width', Math.round(nw) + 'px');
        setStyleVal(n, 'height', Math.round(nh) + 'px');
        setStyleVal(n, 'left', Math.round(nl) + 'px');
        setStyleVal(n, 'top', Math.round(nt) + 'px');
        // Em texto, a alça redimensiona a fonte junto — é isso que dá a sensação
        // de "esticar o texto" com o mouse.
        if (ehTexto && hInicial > 0) {
          const fator = Math.min(4, Math.max(0.25, nh / hInicial));
          setStyleVal(n, 'fontSize', Math.max(8, Math.round(fs0 * fator)) + 'px');
        }
        applyLiveStyle(target, n);
        w0 = nw * sv; h0 = nh * sv; // overlay volta para coordenadas visuais
        draw();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); requestAnimationFrame(() => ajustarAltura()); scheduleSave(); renderProperties(); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  });

  // Atualiza overlay quando a janela rola ou redimensiona
  const onScroll = () => {
    const r = target.getBoundingClientRect();
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
  };
  canvas.addEventListener('scroll', onScroll, { once: false });
}
function targetForNode(n) {
  const canvas = $('#canvas');
  return canvas ? canvas.querySelector(`[data-zn-id="${n.id}"]`) : null;
}
function applyLiveStyle(el, n) {
  if (!el) return;
  const bp = state.device;
  ['position','left','top','width','height','margin','fontSize','zIndex','opacity'].forEach(k => {
    const v = getStyleVal(n, k, bp);
    // setProperty exige kebab-case: fontSize -> font-size, zIndex -> z-index
    if (v) el.style.setProperty(k.replace(/([A-Z])/g, '-$1').toLowerCase(), String(v));
  });
}

// Um único ponto de seleção — evita handlers duplicados que "brigam" no clique
function selectNode(id) {
  if (state.selectedId === id) return; // nada mudou: não recria nada
  state.selectedId = id;
  const canvas = $('#canvas');
  if (canvas) {
    $$('[data-zn-id].selected', canvas).forEach(x => x.classList.remove('selected'));
    if (id) {
      const el = canvas.querySelector(`[data-zn-id="${id}"]`);
      if (el) el.classList.add('selected');
    }
  }
  renderProperties();
  updateSelectionOverlay();
}

// A Página cresce conforme o conteúdo — nada fica cortado
function ajustarAltura() {
  const canvas = $('#canvas');
  const scaleEl = canvas ? $('#canvasScale', canvas) : null;
  if (!canvas || !scaleEl) return;
  let maxBottom = 900;
  scaleEl.querySelectorAll('[data-zn-id]').forEach(el => {
    if (el === scaleEl.firstElementChild) return;
    const b = el.offsetTop + el.offsetHeight;
    if (b > maxBottom) maxBottom = b;
  });
  const altura = Math.ceil(maxBottom + 40);
  scaleEl.style.height = altura + 'px';
  canvas.style.height = Math.ceil(altura * (state.canvasScale || 1)) + 'px';
}

// Recalcula o autoscaling quando a janela muda de tamanho
function ajustarEscala() {
  const canvas = $('#canvas');
  const scaleEl = canvas ? $('#canvasScale', canvas) : null;
  if (!canvas || !scaleEl) return;
  const s = Math.max(0.1, canvas.clientWidth / 1100);
  scaleEl.style.transform = `scale(${s})`;
  state.canvasScale = s;
  ajustarAltura();
  updateSelectionOverlay();
}
window.addEventListener('resize', ajustarEscala);

let canvasBound = false;
function renderCanvas() {
  const canvas = $('#canvas'); if (!canvas || !state.doc) return;
  // Remove o overlay ANTES de trocar o innerHTML (senão ele vira órfão no DOM)
  const ov = $('#selOverlay'); if (ov) ov.remove();

  canvas.className = state.device;
  // Wrapper com largura-base fixa: tudo escala junto (posições, fontes, fotos)
  // para desktop, tablet e celular — autoscaling em todas as plataformas.
  canvas.innerHTML = '<div id="canvasScale">' + nodeHTML(state.doc.root) + '</div>';
  const scaleEl = $('#canvasScale', canvas);
  const BASE_W = 1100, BASE_H = 900;
  const scale = Math.max(0.1, canvas.clientWidth / BASE_W);
  scaleEl.style.width = BASE_W + 'px';
  scaleEl.style.height = BASE_H + 'px';
  scaleEl.style.transform = `scale(${scale})`;
  state.canvasScale = scale;
  canvas.style.position = 'relative';
  canvas.style.minHeight = '900px';

  // <a>/<button> nunca navegam no editor
  $$('a, button', canvas).forEach(a => {
    a.setAttribute('tabindex', '-1');
    a.setAttribute('data-nolink', '1');
  });

  if (!canvasBound) {
    canvasBound = true;

    // Captura: bloqueia qualquer navegação vinda de links
    canvas.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('a')) e.preventDefault();
    }, true);

    // Seleção por delegação (um único handler)
    canvas.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-zn-id]');
      selectNode(el ? el.dataset.znId : null);
    });

    // Mover arrastando o próprio elemento com o mouse
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest && e.target.closest('.sel-tag, .sel-handle')) return;
      const el = e.target.closest && e.target.closest('[data-zn-id]');
      if (!el) return;
      if (state.selectedId !== el.dataset.znId) selectNode(el.dataset.znId);
      if (moverSelecionado) moverSelecionado(e);
    });

    // Duplo clique em algo com texto edita direto na página
    canvas.addEventListener('dblclick', (e) => {
      const el = e.target.closest && e.target.closest('[data-zn-id]');
      if (!el) return;
      const found = findNode(state.doc.root, el.dataset.znId);
      if (!found || (found.node.text === undefined && found.node.html === undefined)) return;
      e.preventDefault(); e.stopPropagation();
      selectNode(el.dataset.znId);
      const original = String(found.node.text ?? '');
      el.contentEditable = 'true';
      el.style.userSelect = 'text';
      el.focus();
      try {
        const range = document.createRange(); range.selectNodeContents(el);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      } catch (_) {}
      const salvar = () => {
        el.contentEditable = 'false'; el.style.userSelect = '';
        const novo = el.innerText.replace(/\n$/, '');
        if (novo !== original) { snapshot(); found.node.text = novo; scheduleSave(); }
        renderCanvas(); renderProperties();
      };
      el.addEventListener('blur', salvar, { once: true });
      el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); el.blur(); }
        if (ev.key === 'Escape') { ev.preventDefault(); el.textContent = original; el.blur(); }
      });
    });

    // Drag & drop por delegação
    canvas.addEventListener('dragover', (e) => {
      const el = e.target.closest && e.target.closest('[data-zn-id]');
      if (el) { e.preventDefault(); el.classList.add('drop-target'); }
    });
    canvas.addEventListener('dragleave', (e) => {
      const el = e.target.closest && e.target.closest('[data-zn-id]');
      if (el) el.classList.remove('drop-target');
    });
    canvas.addEventListener('drop', (e) => {
      const el = e.target.closest && e.target.closest('[data-zn-id]');
      if (el) el.classList.remove('drop-target');
      const type = e.dataTransfer.getData('text/component');
      if (!type) return;
      e.preventDefault(); e.stopPropagation();
      snapshot();
      const novo = newComponent(type);
      const cr = canvas.getBoundingClientRect();
      const s = state.canvasScale || 1;
      const x = Math.max(0, Math.round((e.clientX - cr.left - 30) / s));
      const y = Math.max(0, Math.round((e.clientY - cr.top - 15) / s));
      novo.styles.position = { [state.device]: 'absolute' };
      novo.styles.left = { [state.device]: x + 'px' };
      novo.styles.top = { [state.device]: y + 'px' };
      novo.styles.zIndex = { [state.device]: String(++state.maxZ) };
      state.doc.root.children = state.doc.root.children || [];
      state.doc.root.children.push(novo);
      const ov2 = $('#selOverlay'); if (ov2) ov2.remove();
      renderCanvas();
      selectNode(novo.id);
    });
  }

  ajustarAltura();
  if (state.selectedId) {
    const el = canvas.querySelector(`[data-zn-id="${state.selectedId}"]`);
    if (el) el.classList.add('selected');
    updateSelectionOverlay();
  }
}
function newComponent(type) {
  const defaults = {
    heading: { text: 'Novo título', tag: 'h2' }, text: { text: 'Novo texto' },
    button: { text: 'Clique aqui', tag: 'button' }, link: { text: 'Link', tag: 'a' },
    image: { src: '', tag: 'img', alt: 'Imagem' }, video: { tag: 'video' },
    divider: { tag: 'hr' }, spacer: { tag: 'div' },
  };
  return { id: uid(), type, name: COMPONENTS.find(c => c[0] === type)?.[1] || type,
    styles: { padding: { desktop: '16px' }, ...(type === 'button' ? { background: { desktop: '#5b8cff' }, color: { desktop: '#fff' }, borderRadius: { desktop: '8px' } } : {}) },
    ...(defaults[type] || {}), children: ['container','section','grid','columns','card','gallery','form','header','footer','list'].includes(type) ? [] : undefined };
}
function renderTree() {
  const el = $('#tree'); if (!el) return;
  const walk = (n, depth = 0) => {
    const icon = COMPONENTS.find(c => c[0] === n.type)?.[2] || '▢';
    return `<div class="tree-item ${state.selectedId === n.id ? 'sel' : ''}" data-tree="${n.id}" style="padding-left:${8 + depth * 12}px">
      <span class="dot"></span><span>${icon}</span><span>${esc(n.name || n.type)}</span></div>
      ${(n.children || []).map(c => walk(c, depth + 1)).join('')}`;
  };
  el.innerHTML = walk(state.doc.root);
  $$('[data-tree]', el).forEach(x => {
    x.onclick = (e) => {
      e.stopPropagation();
      selectNode(x.dataset.tree);
      renderTree();
    };
    // Soltar componente na árvore = adicionar como filho daquele elemento
    x.ondragover = (e) => { e.preventDefault(); x.classList.add('drop-target'); };
    x.ondragleave = () => x.classList.remove('drop-target');
    x.ondrop = (e) => {
      e.preventDefault(); e.stopPropagation(); x.classList.remove('drop-target');
      const type = e.dataTransfer.getData('text/component');
      if (!type) return;
      const found = findNode(state.doc.root, x.dataset.tree);
      if (!found) return;
      snapshot();
      const novo = newComponent(type);
      // Dentro de um container, usa fluxo normal (relative) para organizar
      novo.styles.position = { [state.device]: 'relative' };
      novo.styles.left = { [state.device]: '0px' };
      novo.styles.top = { [state.device]: '0px' };
      found.node.children = found.node.children || [];
      found.node.children.push(novo);
      renderCanvas();
      selectNode(novo.id);
      renderTree();
      toast(`Adicionado em "${found.node.name}"`);
    };
  });
}
function renderComponents() {
  const el = $('#components'); if (!el) return;
  el.innerHTML = `<div class="comp-grid">${COMPONENTS.map(([t, n, i]) => `
    <div class="comp" draggable="true" data-comp="${t}"><span class="ico">${i}</span>${n}</div>`).join('')}</div>`;
  $$('[data-comp]', el).forEach(c => c.ondragstart = (e) => e.dataTransfer.setData('text/component', c.dataset.comp));
}
const PROPS = [
  ['width','Largura','text'],['height','Altura','text'],['padding','Padding','text'],['margin','Margem','text'],
  ['background','Fundo','color'],['color','Cor','color'],['fontSize','Tam. fonte','text'],
  ['fontWeight','Peso','select:300,400,500,600,700,800'],['textAlign','Alinhamento','select:left,center,right'],
  ['display','Display','select:block,flex,grid,inline-block,none'],['gap','Gap','text'],
  ['borderRadius','Arredondamento','text'],['opacity','Opacidade','text'],['textTransform','Maiúsculas','select:none,uppercase,lowercase'],
];
function renderProperties() {
  const el = $('#properties'); if (!el) return;
  const found = state.selectedId ? findNode(state.doc.root, state.selectedId) : null;
  if (!found) {
    el.innerHTML = `<div class="panel-sec"><h3>Propriedades</h3><div class="panel-content">
      <p style="color:var(--muted);font-size:12px;line-height:1.6">Selecione um elemento na página ou na árvore para editar suas propriedades.</p></div></div>`;
    return;
  }
  const n = found.node, bp = state.device;
  // A Página é o fundo fixo — mostra só a cor de fundo, sem mover/redimensionar
  if (n === state.doc.root || n.id === 'root') {
    const bg = String(n.styles?.background?.[bp] ?? n.styles?.background?.desktop ?? '#20242e').replace(/"/g, '&quot;');
    el.innerHTML = `<div class="panel-sec"><h3>Página (fundo fixo)</h3><div class="panel-content">
      <p style="color:var(--muted);font-size:11px;line-height:1.5;margin:0 0 10px">Esta é a base do site. Ela não pode ser movida nem redimensionada. Os elementos são colocados por cima e escalam automaticamente para desktop, tablet e celular.</p>
      <div class="prop"><label>Cor do fundo</label><input id="propPageBg" type="color" value="${bg}"></div>
    </div></div>`;
    const bgInput = $('#propPageBg', el);
    if (bgInput) bgInput.oninput = () => {
      snapshot(); setStyleVal(n, 'background', bgInput.value);
      const scaleEl = $('#canvasScale'); if (scaleEl) scaleEl.style.background = bgInput.value;
      scheduleSave();
    };
    return;
  }
  const getVal = (k) => {
    const v = n.styles?.[k];
    return v && typeof v === 'object' ? (v[bp] ?? v.desktop ?? '') : (v ?? '');
  };
  const rows = PROPS.map(([k, label, type]) => {
    const [kind, opts] = type.includes(':') ? type.split(':') : [type, ''];
    const val = String(getVal(k) || '').replace(/"/g, '&quot;');
    if (kind === 'select') return `<div class="prop"><label>${label}</label><select data-prop="${k}">
      <option value="">—</option>${opts.split(',').map(o => `<option value="${o}" ${String(getVal(k)) === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>`;
    return `<div class="prop"><label>${label}</label><input data-prop="${k}" type="${kind}" value="${val}"></div>`;
  }).join('');
  el.innerHTML = `<div class="panel-sec"><h3>Elemento: ${esc(n.name || n.type)}</h3><div class="panel-content">
      <div class="prop"><label>Texto</label><input id="propText" value="${esc(n.text || '')}"></div>
      <div class="prop"><label>Conteúdo</label><input id="propContent" value="${esc(n.html || '')}" placeholder="HTML (opcional)"></div>
      <div class="prop"><label>Imagem/Link</label><input id="propSrc" value="${esc(n.src || n.href || '')}"></div>
      ${(n.type === 'link' || n.type === 'button') && state.current?.pages?.length ? `
      <div class="prop" style="grid-template-columns:1fr">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="propGoPage" ${n.href && n.href.startsWith('#page:') ? 'checked' : ''}> Ir para outra página
        </label>
        <select id="propPageSelect" style="width:100%;padding:7px;border:1px solid var(--line);border-radius:7px;background:var(--bg-2);font-size:11px">
          <option value="">— selecione —</option>
          ${state.current.pages.map(pg => `<option value="#page:${pg.id}" ${n.href === '#page:' + pg.id ? 'selected' : ''}>${esc(pg.name)}</option>`).join('')}
        </select>
      </div>` : ''}
      ${n.type === 'image' ? `<div style="margin:8px 0">
        <label class="btn sm block" style="cursor:pointer">↑ Enviar foto
          <input type="file" id="uploadFoto" accept="image/*" style="display:none">
        </label>
        ${n.src ? `<img src="${esc(n.src)}" style="width:100%;max-height:140px;object-fit:cover;border-radius:8px;margin-top:8px">` : ''}
        <div class="prop" style="grid-template-columns:74px 1fr;margin-top:8px"><label>Transparência</label>
          <input type="range" id="imgOpacity" min="0" max="100" value="${parseFloat(getVal('opacity')) * 100 || 100}"></div>
        <div class="prop" style="grid-template-columns:74px 1fr"><label>Posição</label>
          <select id="imgLayer">
            <option value="front" ${String(getVal('zIndex')) !== '-1' ? 'selected' : ''}>Sobrepor (frente)</option>
            <option value="back" ${String(getVal('zIndex')) === '-1' ? 'selected' : ''}>Ficar em baixo</option>
          </select></div>
      </div>` : ''}
      ${rows}
      <div style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
        <button class="btn sm" id="dupEl">Duplicar</button>
        <button class="btn sm" id="lockEl">${n.locked ? 'Desbloquear' : 'Bloquear'}</button>
        <button class="btn sm danger" id="delEl">Excluir</button>
      </div>
      <p style="color:var(--muted);font-size:10px;margin-top:10px">Editando: <strong style="color:var(--accent-2)">${bp}</strong></p>
    </div></div>`;
  $$('[data-prop]', el).forEach(input => input.onchange = () => {
    snapshot();
    n.styles = n.styles || {};
    const cur = n.styles[input.dataset.prop];
    if (cur && typeof cur === 'object') cur[bp] = input.value;
    else n.styles[input.dataset.prop] = { [bp]: input.value };
    renderCanvas();
  });
  const uploadInput = $('#uploadFoto', el);
  if (uploadInput) uploadInput.onchange = async () => {
    const file = uploadInput.files?.[0]; if (!file) return;
    if (file.size > 10 * 1024 * 1024) return toast('Imagem muito grande (máx 10MB).');
    toast('Enviando imagem...');
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 8192) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        const base64 = btoa(bin);
        const r = await api('/assets/upload', 'POST', {
          base64, mimeType: file.type, fileName: file.name,
          projectId: state.current.id,
        });
        snapshot(); n.src = r.url; renderCanvas(); renderProperties();
        toast('Foto enviada!');
      } catch (e) { toast('Erro: ' + e.message); }
    })();
  };
  $('#propText', el).oninput = () => { snapshot(); n.text = $('#propText', el).value; renderCanvas(); };
  $('#propSrc', el).oninput = () => { snapshot(); if (n.type === 'image' || n.type === 'video') n.src = $('#propSrc', el).value; else n.href = $('#propSrc', el).value; renderCanvas(); };
  const imgOpacity = $('#imgOpacity', el), imgLayer = $('#imgLayer', el);
  if (imgOpacity) imgOpacity.oninput = () => {
    snapshot();
    setStyleVal(n, 'opacity', String(Number(imgOpacity.value) / 100));
    applyLiveStyle(targetForNode(n), n);
  };
  if (imgLayer) imgLayer.onchange = () => {
    snapshot();
    setStyleVal(n, 'zIndex', imgLayer.value === 'back' ? '-1' : String(++state.maxZ));
    setStyleVal(n, 'position', 'relative');
    renderCanvas();
  };
  const goPage = $('#propGoPage', el), pageSel = $('#propPageSelect', el);
  if (goPage && pageSel) {
    goPage.onchange = () => {
      snapshot();
      if (goPage.checked) {
        const v = pageSel.value || ('#page:' + state.current.pages[0].id);
        pageSel.value = v; n.href = v;
      } else n.href = '';
      $('#propSrc', el).value = n.href || '';
    };
    pageSel.onchange = () => {
      snapshot(); n.href = pageSel.value;
      $('#propSrc', el).value = n.href;
    };
  }
  $('#dupEl', el).onclick = () => {
    snapshot();
    const copy = JSON.parse(JSON.stringify(n)); copy.id = uid(); copy.name = n.name + ' (cópia)';
    const arr = found.parent ? found.parent.children : state.doc.root.children;
    arr.splice(arr.indexOf(n) + 1, 0, copy);
    renderCanvas(); selectNode(copy.id); renderTree();
  };
  $('#lockEl', el).onclick = () => { snapshot(); n.locked = !n.locked; renderProperties(); };
  $('#delEl', el).onclick = excluirSelecionado;
}
function excluirSelecionado() {
  const found = state.selectedId ? findNode(state.doc.root, state.selectedId) : null;
  if (!found) return;
  const n = found.node;
  if (n === state.doc.root || n.id === 'root') return toast('A raiz não pode ser excluída.');
  snapshot();
  const arr = found.parent ? found.parent.children : state.doc.root.children;
  const i = arr.indexOf(n);
  if (i >= 0) arr.splice(i, 1);
  renderCanvas(); selectNode(null); renderTree(); scheduleSave();
}

// ===== MENU CONTEXTUAL (botão direito) =====
function closeContextMenu() { const m = $('#ctxMenu'); if (m) m.remove(); }
function showContextMenu(x, y, nodeId) {
  closeContextMenu();
  const found = nodeId ? findNode(state.doc.root, nodeId) : null;
  if (!found || found.node === state.doc.root || found.node.id === 'root') return;
  const n = found.node;
  const menu = document.createElement('div');
  menu.id = 'ctxMenu'; menu.className = 'ctx-menu';
  menu.innerHTML = `<button data-act="rename">✏️ Renomear</button>
    <button data-act="color">🎨 Editar cor</button>
    <button data-act="delete">🗑️ Excluir</button>`;
  document.body.appendChild(menu);
  menu.style.left = Math.min(x, innerWidth - 190) + 'px';
  menu.style.top = Math.min(y, innerHeight - 130) + 'px';
  $$('button', menu).forEach(b => b.onclick = () => {
    const act = b.dataset.act;
    closeContextMenu();
    if (act === 'rename') {
      const novo = prompt('Novo nome:', n.name || n.type);
      if (novo && novo.trim()) { snapshot(); n.name = novo.trim(); renderTree(); renderProperties(); scheduleSave(); }
    } else if (act === 'color') {
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = String(n.styles?.background?.[state.device] || n.styles?.background?.desktop || '#5b8cff');
      inp.oninput = () => { snapshot(); setStyleVal(n, 'background', inp.value); renderCanvas(); scheduleSave(); };
      inp.click();
    } else if (act === 'delete') {
      excluirSelecionado();
    }
  });
}
document.addEventListener('click', () => closeContextMenu());
document.addEventListener('contextmenu', (e) => {
  const cv = $('#canvas');
  if (!cv || !cv.contains(e.target)) return;
  e.preventDefault();
  const el = e.target.closest && e.target.closest('[data-zn-id]');
  if (!el) return;
  selectNode(el.dataset.znId);
  showContextMenu(e.clientX, e.clientY, el.dataset.znId);
});
async function loadPages() {
  const r = await api(`/projects/${state.current.id}`);
  state.current.pages = r.pages;
  state.current.documents = r.documents;
}
function renderPageTabs() {
  const el = $('#pageTabs'); if (!el || !state.current?.pages) return;
  el.innerHTML = state.current.pages.map(p =>
    `<button class="page-tab ${p.id === state.pageId ? 'on' : ''}" data-page="${p.id}">${esc(p.name)}${p.is_home ? '' : `<span class="page-del" data-delpage="${p.id}" title="Excluir página">×</span>`}</button>`
  ).join('');
  $$('[data-delpage]', el).forEach(b => b.onclick = async (e) => {
    e.stopPropagation();
    if (!confirm('Excluir esta página?')) return;
    try {
      const r = await api(`/projects/${state.current.id}/pages/${b.dataset.delpage}`, 'DELETE');
      await loadPages();
      if (b.dataset.delpage === state.pageId) {
        state.pageId = r.newHomeId || state.current.pages[0].id;
      }
      state.doc = JSON.parse(state.current.documents[state.pageId]);
      state.selectedId = null;
      renderPageTabs(); renderCanvas(); renderProperties();
      toast('Página excluída.');
    } catch (err) { toast(err.message); }
  });
  $$('[data-page]', el).forEach(b => b.onclick = async () => {
    if (b.dataset.page === state.pageId) return;
    state.pageId = b.dataset.page;
    state.doc = JSON.parse(state.current.documents[state.pageId]);
    state.selectedId = null;
    renderPageTabs(); renderCanvas(); renderProperties();
  });
}
async function addPage() {
  const nome = prompt('Nome da nova página:', `Página ${state.current.pages.length + 1}`);
  if (!nome) return;
  try {
    const r = await api(`/projects/${state.current.id}/pages`, 'POST', { name: nome });
    await loadPages();
    state.pageId = r.page.id;
    state.doc = JSON.parse(state.current.documents[state.pageId]);
    renderPageTabs(); renderCanvas(); renderProperties();
    toast('Página criada!');
  } catch (e) { toast(e.message); }
}
function editorView() {
  return `<div class="editor">
    <div class="ed-top">
      <div class="brand"><div class="brand-mark">Z</div><span>ZKNSites</span></div>
      <input class="ed-name" id="edName" value="${esc(state.current.name)}">
      <div class="page-tabs" id="pageTabs"></div>
      <button class="btn sm ghost" id="addPageBtn" title="Nova página">+ Página</button>
      <span class="badge" id="saveStatus">✓ Salvo</span>
      <div class="spacer"></div>
      <div class="seg" id="deviceSeg">
        <button data-dev="desktop" class="${state.device === 'desktop' ? 'on' : ''}">Desktop</button>
        <button data-dev="tablet" class="${state.device === 'tablet' ? 'on' : ''}">Tablet</button>
        <button data-dev="mobile" class="${state.device === 'mobile' ? 'on' : ''}">Celular</button>
      </div>
      <button class="btn sm ghost" id="undoBtn" title="Desfazer">↶</button>
      <button class="btn sm ghost" id="redoBtn" title="Refazer">↷</button>
      <button class="btn sm" id="previewBtn">Pré-visualizar</button>
      <button class="btn sm" id="publishBtn">Publicar</button>
      <button class="btn sm primary" id="finishBtn">Finalizar site</button>
      <button class="btn sm ghost" id="backBtn">Sair</button>
    </div>
    <div class="ed-body">
      <aside class="ed-left">
        <div class="panel-sec"><h3>Camadas</h3><div class="panel-content" id="tree"></div></div>
        <div class="panel-sec"><h3>Componentes <small style="color:var(--muted);font-size:9px">arraste</small></h3><div class="panel-content" id="components"></div></div>
      </aside>
      <div class="ed-center"><div class="canvas-wrap"><div id="canvas"></div></div></div>
      <aside class="ed-right"><div id="properties"></div></aside>
    </div>
  </div>`;
}
function bindEditor() {
  $('#edName').onchange = async (e) => {
    try { await api(`/projects/${state.current.id}`, 'PUT', { name: e.target.value, seo_title: e.target.value }); toast('Nome salvo.'); } catch (err) { toast(err.message); }
  };
  $$('#deviceSeg button').forEach(b => b.onclick = () => {
    state.device = b.dataset.dev;
    $$('#deviceSeg button').forEach(x => x.classList.toggle('on', x === b));
    renderCanvas(); renderProperties();
  });
  $('#undoBtn').onclick = undo; $('#redoBtn').onclick = redo;
  $('#backBtn').onclick = () => { state.current = null; state.doc = null; loadDashboard(); };
  $('#previewBtn').onclick = async () => {
    const btn = $('#previewBtn'); btn.disabled = true; btn.textContent = 'Abrindo...';
    try {
      const r = await api(`/projects/${state.current.id}/preview`, 'POST', { document: state.doc, pageId: state.pageId });
      window.open(r.url, '_blank');
    } catch (e) { toast(e.message); }
    btn.disabled = false; btn.textContent = 'Pré-visualizar';
  };
  $('#finishBtn').onclick = () => showCheckout();
  $('#addPageBtn').onclick = addPage;
  renderPageTabs();
  $('#publishBtn').onclick = async () => {
    const b = $('#publishBtn'); b.disabled = true; b.textContent = 'Publicando...';
    try {
      const r = await api(`/projects/${state.current.id}/publish`, 'POST', {});
      toast('Site publicado!'); window.open(r.url, '_blank');
    } catch (e) { toast(e.message); }
    b.disabled = false; b.textContent = 'Publicar';
  };
  renderTree(); renderComponents();
}

// ======================= CHECKOUT (Nexas) =======================
let checkoutTimer = null;
async function showCheckout() {
  const plans = await api('/payments/plans');
  const div = document.createElement('div');
  div.className = 'modal';
  div.innerHTML = `<div class="modal-card" style="width:min(100%,520px)">
    <h2>Finalizar seu site</h2>
    <p class="sub">Escolha o plano, pague com PIX e seu site será publicado com domínio próprio.</p>
    <div id="planList" style="display:grid;gap:10px;margin-bottom:16px">
      ${plans.plans.map((p, i) => `<label class="plan-opt" style="display:flex;gap:12px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:10px;cursor:pointer;${i === 0 ? 'border-color:var(--accent);background:rgba(91,140,255,.08)' : ''}">
        <input type="radio" name="plan" value="${p.price}" ${i === 0 ? 'checked' : ''}>
        <span style="flex:1"><strong>${p.name}</strong><br><small style="color:var(--muted)">${esc(p.description)}</small></span>
        <strong style="color:var(--accent-2)">R$ ${p.price.toFixed(2).replace('.', ',')}</strong>
      </label>`).join('')}
    </div>
    <div id="checkoutPix" class="hidden" style="text-align:center;padding:10px 0">
      <p style="font-size:13px;color:var(--muted)">Escaneie o QR Code ou copie o código PIX:</p>
      <div id="pixQr" style="display:inline-block;padding:12px;background:#fff;border-radius:12px;margin:12px 0"></div>
      <input id="pixCode" readonly style="width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg-2);font-size:11px;color:var(--cyan)">
      <button class="btn sm" id="copyPix" style="margin-top:8px">Copiar código</button>
      <p id="pixStatus" style="font-size:12px;color:var(--gold);margin-top:10px">Aguardando pagamento...</p>
    </div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn primary" id="payBtn">Gerar PIX</button>
      <button class="btn ghost" id="closeCheckout">Fechar</button>
    </div>
  </div>`;
  document.body.appendChild(div);
  $('#closeCheckout', div).onclick = () => { clearInterval(checkoutTimer); div.remove(); };
  $$('input[name=plan]', div).forEach(r => r.onchange = () => {
    $$('.plan-opt', div).forEach(l => l.style.borderColor = 'var(--line)');
    r.closest('.plan-opt').style.borderColor = 'var(--accent)';
  });
  $('#payBtn', div).onclick = async () => {
    const amount = Number($('input[name=plan]:checked', div).value);
    const btn = $('#payBtn', div); btn.disabled = true; btn.textContent = 'Gerando...';
    try {
      const r = await api('/payments/checkout', 'POST', { projectId: state.current.id, amount });
      $('#checkoutPix', div).classList.remove('hidden');
      const qr = $('#pixQr', div); qr.innerHTML = '';
      if (r.pixImage) qr.innerHTML = `<img src="${r.pixImage}" style="width:200px">`;
      else if (window.QRCode) new QRCode(qr, { text: r.pixCode, width: 200, height: 200 });
      else qr.innerHTML = `<div style="width:200px;height:200px;display:grid;place-items:center;font-size:11px;color:#000">QR indisponível — use o código abaixo</div>`;
      $('#pixCode', div).value = r.pixCode;
      btn.textContent = 'PIX gerado';
      $('#copyPix', div).onclick = () => {
        const c = $('#pixCode', div); c.select(); document.execCommand('copy'); toast('Código copiado!');
      };
      // polling
      clearInterval(checkoutTimer);
      checkoutTimer = setInterval(async () => {
        try {
          const s = await api('/payments/status?external_id=' + encodeURIComponent(r.identifier));
          if (s.pago) {
            clearInterval(checkoutTimer);
            $('#pixStatus', div).textContent = 'Pagamento confirmado! Seu site foi liberado.';
            $('#pixStatus', div).style.color = 'var(--green)';
            setTimeout(() => { div.remove(); loadDashboard(); }, 2200);
          }
        } catch {}
      }, 5000);
    } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = 'Gerar PIX'; }
  };
}

// ======================= RENDER =======================
let opts = { authMode: 'login', editor: false };
function render(o = {}) {
  Object.assign(opts, o);
  const app = $('#app');
  if (state.editor && state.current && state.doc) {
    app.innerHTML = editorView();
    return;
  }
  if (state.token && state.user) {
    if (!state.projects.length && !opts.loaded) {
      app.innerHTML = `<div class="auth-wrap"><div class="auth-bg"></div><p>Carregando...</p></div>`;
      opts.loaded = true;
      loadDashboard(); return;
    }
    app.innerHTML = dashboardView(); bindDashboard(); return;
  }
  app.innerHTML = authView(opts.authMode); bindAuth(opts.authMode);
}

// Boot
if (state.token && state.user) {
  try { const r = await api('/auth/me'); state.user = r.user; localStorage.setItem(USER_KEY, JSON.stringify(r.user)); } catch { logout(); }
}
render();
