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
};

function declsFor(styles: ElementStyles, bp: keyof typeof BREAKPOINTS): string {
  const out: string[] = [];
  for (const [key, cssProp] of Object.entries(STYLE_KEYS)) {
    const val = resolve((styles as any)[key], bp);
    if (val !== undefined && val !== '') out.push(`${cssProp}:${cssSafe(val)}`);
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
function renderNode(node: ElementNode, bp: keyof typeof BREAKPOINTS, classPrefix: string): string {
  const hidden = resolve(node.styles.hidden as ResponsiveValue, bp);
  if (hidden === 'true' || node.hidden) return '';

  const tag = node.tag || TAG_BY_TYPE[node.type] || 'div';
  const cls = `zn-${node.type} ${(node.classes || []).join(' ')}`.trim();
  const attrs: string[] = [`class="${esc(cls)}"`, `data-zn-id="${esc(node.id)}"`];
  if (tag === 'button' && node.href) {
    let href = node.href;
    const mp = href.match(/^#page:(.+)$/);
    if (mp) href = LINKS[mp[1]] || mp[1];
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
    if (mPage) href = LINKS[mPage[1]] || mPage[1];
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

export function renderPage(doc: PageDocument, pageLinks: Record<string, string> = {}): RenderedSite {
  LINKS = pageLinks;
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
<style>${css}</style>
</head>
<body>
${renderNode(doc.root, 'desktop', '')}
</body>
</html>`;

  return { html, css, meta: doc.meta };
}
