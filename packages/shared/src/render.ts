// ============================================================
// Renderizador de sites publicados — converte PageDocument em HTML/CSS
// ============================================================
import type { ElementNode, ElementStyles, PageDocument, RenderedSite, ResponsiveValue } from './types';

const BREAKPOINTS = { desktop: 0, tablet: 900, mobile: 600 } as const;

function esc(s: string | undefined | null): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function cssSafe(v: unknown): string {
  return String(v ?? '').replace(/[;{}]/g, '').trim();
}

function resolve(v: ResponsiveValue | undefined, bp: keyof typeof BREAKPOINTS): string | undefined {
  if (!v) return undefined;
  return v[bp] ?? v.desktop ?? (typeof v === 'string' ? v : undefined);
}

const STYLE_KEYS: Record<string, string> = {
  width: 'width', height: 'height', minHeight: 'min-height', maxWidth: 'max-width',
  display: 'display', flexDirection: 'flex-direction', alignItems: 'align-items',
  justifyContent: 'justify-content', flexWrap: 'flex-wrap', gap: 'gap',
  gridTemplateColumns: 'grid-template-columns', position: 'position',
  top: 'top', left: 'left', right: 'right', bottom: 'bottom', zIndex: 'z-index',
  overflow: 'overflow', margin: 'margin', marginTop: 'margin-top',
  marginRight: 'margin-right', marginBottom: 'margin-bottom', marginLeft: 'margin-left',
  padding: 'padding', paddingTop: 'padding-top', paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom', paddingLeft: 'padding-left', color: 'color',
  background: 'background', backgroundImage: 'background-image', border: 'border',
  borderRadius: 'border-radius', boxShadow: 'box-shadow', opacity: 'opacity',
  transform: 'transform', transition: 'transition', fontFamily: 'font-family',
  fontSize: 'font-size', fontWeight: 'font-weight', lineHeight: 'line-height',
  letterSpacing: 'letter-spacing', textAlign: 'text-align', textTransform: 'text-transform',
  textDecoration: 'text-decoration', animation: 'animation', animationDelay: 'animation-delay',
  animationDuration: 'animation-duration', animationIterationCount: 'animation-iteration-count',
  animationTimingFunction: 'animation-timing-function',
  backdropFilter: 'backdrop-filter', filter: 'filter', textShadow: 'text-shadow',
  outline: 'outline', cursor: 'cursor', aspectRatio: 'aspect-ratio',
  objectFit: 'object-fit', objectPosition: 'object-position', placeItems: 'place-items',
  alignContent: 'align-content', justifyItems: 'justify-items',
  gridAutoRows: 'grid-auto-rows', clipPath: 'clip-path', perspective: 'perspective',
  transformStyle: 'transform-style', mixBlendMode: 'mix-blend-mode',
  backgroundSize: 'background-size', backgroundPosition: 'background-position',
  backgroundRepeat: 'background-repeat', borderImage: 'border-image',
  inset: 'inset', willChange: 'will-change', contain: 'contain',
};

function declsFor(styles: ElementStyles, bp: keyof typeof BREAKPOINTS): string {
  const out: string[] = [];
  for (const [key, cssProp] of Object.entries(STYLE_KEYS)) {
    let val = resolve((styles as any)[key], bp);
    if (val === undefined || val === '') continue;
    // left/top ficam em px do canvas-base (1100px). O site publicado usa o
    // mesmo canvas escalado do editor — converter para % quebraria o relative.
    out.push(`${cssProp}:${cssSafe(val)}`);
  }
  for (const [k, v] of Object.entries(styles)) {
    if (!k.startsWith('--')) continue;
    const custom = resolve(v as ResponsiveValue, bp);
    if (custom) out.push(`${k}:${cssSafe(custom)}`);
  }
  return out.join(';');
}

const TAG_BY_TYPE: Record<string, string> = {
  root: 'div', section: 'section', container: 'div', grid: 'div', columns: 'div', column: 'div',
  text: 'p', heading: 'h2', image: 'img', video: 'video', button: 'button', link: 'a',
  form: 'form', input: 'input', textarea: 'textarea', select: 'select', checkbox: 'input',
  label: 'label', menu: 'nav', header: 'header', footer: 'footer', card: 'article',
  gallery: 'div', testimonial: 'blockquote', table: 'table', icon: 'span',
  divider: 'hr', spacer: 'div', list: 'ul', 'list-item': 'li',
};

let LINKS: Record<string, string> = {};
let PREVIEW_TOKEN = '';
function linkHref(slug: string): string {
  if (PREVIEW_TOKEN) return `?preview=${encodeURIComponent(PREVIEW_TOKEN)}&page=${encodeURIComponent(slug)}`;
  return slug || '/';
}
function renderNode(node: ElementNode, bp: keyof typeof BREAKPOINTS, classPrefix: string): string {
  const hidden = resolve(node.styles.hidden as ResponsiveValue, bp);
  if (hidden === 'true' || node.hidden) return '';

  const tag = node.tag || TAG_BY_TYPE[node.type] || 'div';
  const cls = `zn-${node.type} ${(node.classes || []).join(' ')}`.trim();
  const attrs: string[] = [`class="${esc(cls)}"`, `data-zn-id="${esc(node.id)}"`];
  if (tag === 'button' && node.href) {
    let href = node.href;
    const mp = href.match(/^#page:(.+)$/);
    if (mp) href = linkHref(LINKS[mp[1]] ?? mp[1]);
    attrs.push(`href="${esc(href)}"`);
  }
  const decl = declsFor(node.styles, bp);
  if (decl) attrs.push(`style="${esc(decl)}"`);
  for (const [k, v] of Object.entries(node.attributes || {})) {
    if (/^on/i.test(k)) continue; // nunca renderizar handlers inline
    attrs.push(`${esc(k)}="${esc(v)}"`);
  }

  let inner = '';
  if (node.type === 'image') {
    attrs.push(`src="${esc(node.src || '')}"`, `alt="${esc(node.alt || node.name)}"`, 'loading="lazy"');
  } else if (node.type === 'video') {
    attrs.push(`src="${esc(node.src || '')}"`, 'controls', 'playsinline', 'preload="metadata"');
  } else if (node.type === 'link') {
    let href = node.href || '#';
    const mPage = href.match(/^#page:(.+)$/);
    if (mPage) href = linkHref(LINKS[mPage[1]] ?? mPage[1]);
    attrs.push(`href="${esc(href)}"`);
    inner = esc(node.text || node.name);
  } else if (node.type === 'input' || node.type === 'checkbox') {
    attrs.push(`type="${esc(node.attributes?.type || (node.type === 'checkbox' ? 'checkbox' : 'text'))}"`);
    if (node.attributes?.placeholder) attrs.push(`placeholder="${esc(node.attributes.placeholder)}"`);
    if (node.type === 'checkbox' && node.attributes?.name) attrs.push(`name="${esc(node.attributes.name)}"`);
  } else if (node.type === 'form') {
    attrs.push('method="post"', 'action="/api/forms/submit"');
  }

  const children = (node.children || []).map(c => renderNode(c, bp, classPrefix)).join('');
  inner = inner || children || (node.html ? node.html : esc(node.text || ''));

  if (['img', 'input', 'hr', 'br'].includes(tag)) return `<${tag} ${attrs.join(' ')}>`;
  const finalTag = (tag === 'button' && node.href) ? 'a' : tag;
  return `<${finalTag} ${attrs.join(' ')}>${inner}</${finalTag}>`;
}

function cssForTree(node: ElementNode, bp: keyof typeof BREAKPOINTS): string {
  const decl = declsFor(node.styles, bp);
  const rule = decl ? `.zn-${node.type}[data-zn-id="${node.id}"]{${decl}}` : '';
  return rule + (node.children || []).map(c => cssForTree(c, bp)).join('');
}

// Biblioteca de design e animações disponível para todos os sites gerados.
// O agente de IA usa essas classes para criar sites profissionais com movimento.
const PRO_CSS = `
/* ---- keyframes ---- */
@keyframes znFadeUp{from{opacity:0;transform:translateY(38px)}to{opacity:1;transform:none}}
@keyframes znFadeDown{from{opacity:0;transform:translateY(-38px)}to{opacity:1;transform:none}}
@keyframes znSlideL{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:none}}
@keyframes znSlideR{from{opacity:0;transform:translateX(60px)}to{opacity:1;transform:none}}
@keyframes znZoom{from{opacity:0;transform:scale(.82)}to{opacity:1;transform:none}}
@keyframes znFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-16px)}}
@keyframes znBob{0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-9px) rotate(1deg)}}
@keyframes znPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.06);opacity:.82}}
@keyframes znGlow{0%,100%{box-shadow:0 0 22px rgba(99,102,241,.35),0 0 60px rgba(168,85,247,.18)}50%{box-shadow:0 0 42px rgba(99,102,241,.7),0 0 100px rgba(168,85,247,.42)}}
@keyframes znShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes znMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
@keyframes znSpin{to{transform:rotate(360deg)}}
@keyframes znGradient{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
@keyframes znRing{0%{transform:scale(.7);opacity:.9}100%{transform:scale(2.2);opacity:0}}
@keyframes znTilt{0%,100%{transform:perspective(900px) rotateX(0) rotateY(0)}50%{transform:perspective(900px) rotateX(5deg) rotateY(-5deg)}}
/* ---- entrada ---- */
.anim-fade-up{animation:znFadeUp .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d,0s)}
.anim-fade-down{animation:znFadeDown .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d,0s)}
.anim-slide-left{animation:znSlideL .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d,0s)}
.anim-slide-right{animation:znSlideR .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d,0s)}
.anim-zoom{animation:znZoom .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:var(--d,0s)}
.anim-float{animation:znFloat 5s ease-in-out infinite;animation-delay:var(--d,0s)}
.anim-bob{animation:znBob 4s ease-in-out infinite}
.anim-pulse{animation:znPulse 2.4s ease-in-out infinite}
.anim-glow{animation:znGlow 2.8s ease-in-out infinite}
.anim-tilt{animation:znTilt 8s ease-in-out infinite;transform-style:preserve-3d}
.anim-spin{animation:znSpin 14s linear infinite}
.anim-gradient{background-size:200% 200%;animation:znGradient 7s ease infinite}
/* ---- scroll reveal ---- */
.reveal{opacity:0;transform:translateY(34px);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1);transition-delay:var(--d,0s)}
.reveal.is-visible{opacity:1;transform:none}
/* ---- hover ---- */
.hover-lift{transition:transform .35s cubic-bezier(.2,.7,.2,1),box-shadow .35s ease,border-color .35s ease}
.hover-lift:hover{transform:translateY(-10px);box-shadow:0 26px 60px rgba(0,0,0,.28)}
.hover-glow{transition:box-shadow .35s ease,transform .35s ease}
.hover-glow:hover{box-shadow:0 0 38px rgba(99,102,241,.6);transform:translateY(-4px)}
.hover-zoom{overflow:hidden}
.hover-zoom img,.hover-zoom>img{transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.hover-zoom:hover img{transform:scale(1.12)}
/* ---- superfícies ---- */
.glass{background:rgba(255,255,255,.07);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.16)}
.gradient-text{background:linear-gradient(100deg,#fff 10%,#a78bfa 45%,#38bdf8 80%);background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:znGradient 6s ease infinite}
.text-glow{text-shadow:0 0 24px rgba(129,140,248,.65)}
.shimmer{background:linear-gradient(100deg,rgba(255,255,255,.04) 20%,rgba(255,255,255,.22) 45%,rgba(255,255,255,.04) 70%);background-size:200% 100%;animation:znShimmer 2.4s linear infinite}
.mesh{background-image:radial-gradient(at 16% 18%,rgba(99,102,241,.5) 0,transparent 42%),radial-gradient(at 84% 12%,rgba(217,70,239,.42) 0,transparent 40%),radial-gradient(at 62% 88%,rgba(14,165,233,.4) 0,transparent 45%)}
.orb{position:absolute;border-radius:50%;filter:blur(70px);opacity:.55;pointer-events:none;animation:znFloat 9s ease-in-out infinite}
.ring{position:absolute;inset:0;border:2px solid currentColor;border-radius:inherit;animation:znRing 2.6s ease-out infinite;pointer-events:none}
/* ---- marquee ---- */
.marquee{overflow:hidden;white-space:nowrap;display:flex}
.marquee-track{display:flex;gap:48px;min-width:200%;animation:znMarquee 26s linear infinite}
.marquee:hover .marquee-track{animation-play-state:paused}
/* ---- botões e cards ---- */
.btn-pro{display:inline-flex;align-items:center;justify-content:center;gap:10px;padding:16px 34px;border-radius:999px;font-weight:700;border:0;cursor:pointer;text-decoration:none;transition:transform .3s ease,box-shadow .3s ease,filter .3s ease}
.btn-pro:hover{transform:translateY(-4px) scale(1.03);filter:brightness(1.1)}
.card-pro{position:relative;overflow:hidden;border-radius:22px;border:1px solid rgba(255,255,255,.12);transition:transform .4s cubic-bezier(.2,.7,.2,1),border-color .4s ease,box-shadow .4s ease}
.card-pro:hover{transform:translateY(-12px);border-color:rgba(167,139,250,.6);box-shadow:0 30px 70px rgba(0,0,0,.35)}
.card-pro::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 40%,rgba(255,255,255,.14) 50%,transparent 60%);transform:translateX(-120%);transition:transform .7s ease}
.card-pro:hover::after{transform:translateX(120%)}
/* ---- utilitários ---- */
.stagger>*{animation:znFadeUp .8s cubic-bezier(.2,.7,.2,1) both}
.stagger>*:nth-child(1){animation-delay:.05s}.stagger>*:nth-child(2){animation-delay:.14s}
.stagger>*:nth-child(3){animation-delay:.23s}.stagger>*:nth-child(4){animation-delay:.32s}
.stagger>*:nth-child(5){animation-delay:.41s}.stagger>*:nth-child(6){animation-delay:.5s}
.eyebrow{letter-spacing:.22em;text-transform:uppercase;font-size:12px;font-weight:800;opacity:.75}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
@media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none}.anim-fade-up,.anim-fade-down,.anim-slide-left,.anim-slide-right,.anim-zoom,.anim-float,.anim-bob,.anim-pulse,.anim-glow,.anim-tilt,.anim-spin,.anim-gradient,.card-pro::after{animation:none!important}}
`;

const SITE_AI_WIDGET = (brand: string): string => `<style>
.zn-ai-fab{position:fixed;right:20px;bottom:20px;z-index:99999;width:56px;height:56px;border-radius:50%;border:0;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-size:24px;cursor:pointer;box-shadow:0 12px 34px rgba(99,102,241,.5);transition:transform .2s}
.zn-ai-fab:hover{transform:scale(1.08)}
.zn-ai-panel{position:fixed;right:20px;bottom:88px;z-index:99999;width:min(350px,calc(100vw - 40px));max-height:min(520px,72vh);background:#111119;color:#f4f4f5;border:1px solid #ffffff22;border-radius:16px;box-shadow:0 24px 70px #0009;display:flex;flex-direction:column;overflow:hidden;font-family:inherit}
.zn-ai-panel[hidden]{display:none}
.zn-ai-head{display:flex;align-items:center;justify-content:space-between;padding:13px 15px;border-bottom:1px solid #ffffff18;font-weight:700;font-size:13px}
.zn-ai-head button{background:none;border:0;color:#a1a1aa;font-size:20px;cursor:pointer}
.zn-ai-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:9px;font-size:12.5px;line-height:1.55}
.zn-ai-msg{max-width:88%;padding:9px 12px;border-radius:11px;white-space:pre-wrap;word-break:break-word}
.zn-ai-msg.bot{background:#ffffff12;border:1px solid #ffffff18}
.zn-ai-msg.user{background:#6366f1;color:#fff;align-self:flex-end}
.zn-ai-input{display:flex;gap:7px;padding:11px;border-top:1px solid #ffffff18}
.zn-ai-input input{flex:1;min-width:0;background:#ffffff0d;border:1px solid #ffffff24;border-radius:9px;padding:9px 11px;color:#fff;outline:none;font:inherit;font-size:12px}
.zn-ai-input button{background:#6366f1;color:#fff;border:0;border-radius:9px;width:38px;cursor:pointer;font-size:15px}
</style>
<button class="zn-ai-fab" id="znAiFab" aria-label="Assistente">✨</button>
<div class="zn-ai-panel" id="znAiPanel" hidden>
<div class="zn-ai-head"><span>✨ ${esc(brand || 'Assistente')}</span><button id="znAiClose" aria-label="Fechar">×</button></div>
<div class="zn-ai-msgs" id="znAiMsgs"><div class="zn-ai-msg bot">Olá! Sou o assistente deste site. Como posso ajudar?</div></div>
<div class="zn-ai-input"><input id="znAiInput" placeholder="Escreva sua mensagem..."><button id="znAiSend">➤</button></div>
</div>
<script>(function(){var f=document.getElementById('znAiFab'),p=document.getElementById('znAiPanel'),i=document.getElementById('znAiInput'),m=document.getElementById('znAiMsgs');if(!f||!p)return;function msg(t,x){var d=document.createElement('div');d.className='zn-ai-msg '+t;d.textContent=x;m.appendChild(d);m.scrollTop=m.scrollHeight;return d}f.onclick=function(){p.hidden=!p.hidden};document.getElementById('znAiClose').onclick=function(){p.hidden=true};async function send(){var t=(i.value||'').trim();if(!t)return;i.value='';msg('user',t);var w=msg('bot','Pensando...');try{var r=await fetch('https://zknsites-api.gabrielrobin63.workers.dev/api/ai/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t,site:${JSON.stringify(brand || '')}})});var j=await r.json();w.textContent=j.ok?j.reply:(j.message||'Tente novamente em instantes.')}catch(e){w.textContent='Sem conexão no momento.'}}document.getElementById('znAiSend').onclick=send;i.onkeydown=function(e){if(e.key==='Enter'){e.preventDefault();send()}}})()</script>`;

const SCALE_JS = `<script>(function(){function fit(){var v=document.querySelector('.zn-viewport'),c=document.querySelector('.zn-canvas');if(!v||!c)return;var s=v.clientWidth/1100;c.style.transform='scale('+s+')';v.style.height=Math.ceil(c.scrollHeight*s)+'px'}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',fit);else fit();window.addEventListener('resize',fit);if('ResizeObserver'in window)new ResizeObserver(fit).observe(document.body)})()</script>`;

const REVEAL_JS = `<script>(function(){var els=document.querySelectorAll('.reveal');if(!('IntersectionObserver' in window)||!els.length){els.forEach(function(e){e.classList.add('is-visible')});return}var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('is-visible');o.unobserve(e.target)}})},{threshold:.12,rootMargin:'0px 0px -40px 0px'});els.forEach(function(e){o.observe(e)})})</script>`;

export function renderPage(doc: PageDocument, pageLinks: Record<string, string> = {}, previewToken = ''): RenderedSite {
  LINKS = pageLinks;
  PREVIEW_TOKEN = previewToken;
  const baseCss = `
*,*::before,*::after{box-sizing:border-box}
html{margin:0;padding:0;scroll-behavior:smooth}
body{margin:0;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;background:#fff;line-height:1.5}
img,video{max-width:100%;height:auto;display:block}
button,input,textarea,select{font:inherit}
a{color:inherit}
.zn-grid{display:grid}
.zn-columns{display:flex}
.zn-column{flex:1}
.zn-section{padding:64px 24px}
.zn-container{max-width:1120px;margin:0 auto}
.zn-spacer{height:24px}
`;
  const css = baseCss
    + PRO_CSS
    + (doc.meta.customCss ? '\n/* CSS do agente */\n' + doc.meta.customCss.replace(/<\/style/gi, '<\\/style') + '\n' : '')
    + cssForTree(doc.root, 'desktop')
    + '@media(max-width:900px){' + cssForTree(doc.root, 'tablet') + '}'
    + '@media(max-width:600px){' + cssForTree(doc.root, 'mobile') + '}';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(doc.meta.title || 'Site')}</title>
<meta name="description" content="${esc(doc.meta.description || '')}">
${doc.meta.ogImage ? `<meta property="og:image" content="${esc(doc.meta.ogImage)}">` : ''}
${doc.meta.favicon ? `<link rel="icon" href="${esc(doc.meta.favicon)}">` : ''}
${doc.meta.fontUrl ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${esc(doc.meta.fontUrl)}" rel="stylesheet">` : ''}
<style>${css}
/* viewport escalado — o preview e o publicado usam o mesmo canvas do editor */
.zn-viewport{width:100%;overflow:hidden;position:relative}
.zn-canvas{width:1100px;transform-origin:top left;will-change:transform}
</style>
</head>
<body>
<div class="zn-viewport"><div class="zn-canvas">
${renderNode(doc.root, 'desktop', '')}
</div></div>
${SCALE_JS}
${REVEAL_JS}
${doc.meta.aiWidget ? SITE_AI_WIDGET(doc.meta.aiBrand || doc.meta.title || 'Assistente') : ''}
</body>
</html>`;

  return { html, css, meta: doc.meta };
}
