// Gera documentos de templates profissionais para o banco
import type { ElementNode, PageDocument } from '../../packages/shared/src/types';

const id = () => 'n_' + Math.random().toString(36).slice(2, 10);
const n = (type: any, name: string, extra: any = {}): ElementNode => ({
  id: id(), type, name, styles: {}, ...extra,
});
const S = (o: any) => ({ desktop: o });

function base(pal: { bg: string; fg: string; accent: string; muted: string }, logo: string, menu: string[], heroTitle: string, heroText: string, cta: string, sections: ElementNode[]): PageDocument {
  return {
    version: 1,
    meta: { title: heroTitle, description: heroText },
    root: n('root', 'Página', {
      styles: { background: S(pal.bg), color: S(pal.fg), fontFamily: S('Inter, system-ui, sans-serif') },
      children: [
        n('header', 'Cabeçalho', {
          styles: { display: S('flex'), justifyContent: S('space-between'), alignItems: S('center'), padding: S('22px 6%'), background: S(pal.bg), borderBottom: S(`1px solid ${pal.muted}33`) },
          children: [
            n('heading', 'Logo', { text: logo, styles: { fontSize: S('24px'), fontWeight: S('800'), color: S(pal.accent) } }),
            n('menu', 'Menu', { text: menu.join('    '), styles: { color: S(pal.fg), fontSize: S('14px') } }),
          ],
        }),
        n('section', 'Hero', {
          styles: { padding: S('110px 6% 90px'), textAlign: S('center'), background: S(`linear-gradient(160deg, ${pal.bg}, ${pal.muted}22)`) },
          children: [
            n('heading', 'Título', { tag: 'h1', text: heroTitle, styles: { fontSize: S('56px'), fontWeight: S('800'), lineHeight: S('1.05'), marginBottom: S('20px') } }),
            n('text', 'Descrição', { text: heroText, styles: { fontSize: S('19px'), color: S(pal.fg + 'bb'), maxWidth: S('620px'), margin: S('0 auto 30px') } }),
            n('button', 'CTA', { text: cta, styles: { background: S(pal.accent), color: S('#fff'), padding: S('15px 32px'), borderRadius: S('10px'), fontWeight: S('700'), display: S('inline-block') } }),
          ],
        }),
        ...sections,
        n('footer', 'Rodapé', {
          styles: { padding: S('40px 6%'), textAlign: S('center'), background: S(pal.muted + '22'), color: S(pal.fg + 'aa'), fontSize: S('13px') },
          children: [n('text', 'Copyright', { text: `© 2026 ${logo}. Todos os direitos reservados.` })],
        }),
      ],
    }),
  };
}
const sec = (title: string, text: string, pal: any, cols = 3) => n('section', title, {
  styles: { padding: S('80px 6%'), textAlign: S('center') },
  children: [
    n('heading', 'Título da seção', { text: title, styles: { fontSize: S('34px'), fontWeight: S('800'), marginBottom: S('14px') } }),
    n('text', 'Texto da seção', { text, styles: { color: S(pal.fg + 'aa'), maxWidth: S('680px'), margin: S('0 auto 36px') } }),
    n('grid', 'Cards', {
      styles: { display: S('grid'), gridTemplateColumns: S(`repeat(${cols},1fr)`), gap: S('20px'), maxWidth: S('1100px'), margin: S('0 auto') },
      children: Array.from({ length: cols }, (_, i) => n('card', `Card ${i + 1}`, {
        styles: { background: S(pal.muted + '33'), border: S(`1px solid ${pal.muted}55`), borderRadius: S('16px'), padding: S('28px 20px'), textAlign: S('center') },
        children: [
          n('icon', 'Ícone', { text: ['✦', '◆', '★'][i % 3], styles: { fontSize: S('30px'), color: S(pal.accent), display: S('block'), marginBottom: S('12px') } }),
          n('heading', 'Título card', { text: ['Qualidade', 'Agilidade', 'Resultado'][i % 3], styles: { fontSize: S('19px'), fontWeight: S('700'), marginBottom: S('8px') } }),
          n('text', 'Texto card', { text: 'Solução profissional feita para o seu negócio crescer.', styles: { fontSize: S('13px'), color: S(pal.fg + '99') } }),
        ],
      })),
    }),
  ],
});

export const TEMPLATES: { id: string; name: string; category: string; description: string; doc: PageDocument }[] = [
  {
    id: 'portfolio', name: 'Portfólio', category: 'portfolio', description: 'Mostre seus projetos com elegância.',
    doc: base(
      { bg: '#0b0b0f', fg: '#ffffff', accent: '#e8b923', muted: '#2a2a35' },
      'ATELIÊ', ['Início', 'Projetos', 'Sobre', 'Contato'],
      'Criações que contam histórias.', 'Design, estratégia e execução para marcas que querem se destacar.', 'Ver projetos',
      [sec('Projetos selecionados', 'Cada projeto é único — feito com propósito e atenção a cada detalhe.', { fg: '#fff', accent: '#e8b923', muted: '#2a2a35' })]
    ),
  },
  {
    id: 'business', name: 'Empresa', category: 'business', description: 'Site institucional profissional.',
    doc: base(
      { bg: '#071427', fg: '#ffffff', accent: '#3b82f6', muted: '#1e3a5f' },
      'EMPRESA', ['Home', 'Sobre', 'Serviços', 'Contato'],
      'Soluções inteligentes para o seu negócio.', 'Equipe experiente, processos claros e resultados que importam.', 'Fale conosco',
      [sec('Nossos serviços', 'Do planejamento à execução, estamos com você em cada etapa.', { fg: '#fff', accent: '#3b82f6', muted: '#1e3a5f' })]
    ),
  },
  {
    id: 'restaurant', name: 'Restaurante', category: 'restaurant', description: 'Cardápio e reservas online.',
    doc: base(
      { bg: '#1a0f0a', fg: '#fff8ef', accent: '#e07a3f', muted: '#3d2418' },
      'SABOR & ARTE', ['Cardápio', 'Sobre', 'Reservas'],
      'Uma experiência gastronômica única.', 'Ingredientes frescos, receitas autorais e um ambiente feito para você.', 'Reservar mesa',
      [sec('Destaques do cardápio', 'Sabores que combinam tradição e criatividade.', { fg: '#fff8ef', accent: '#e07a3f', muted: '#3d2418' })]
    ),
  },
  {
    id: 'landing', name: 'Landing page', category: 'landing', description: 'Converta visitantes em clientes.',
    doc: base(
      { bg: '#080d1a', fg: '#ffffff', accent: '#22d3ee', muted: '#16324a' },
      'PRODUTO', ['Recursos', 'Preços', 'FAQ'],
      'Transforme ideias em resultados.', 'A ferramenta completa para acelerar o crescimento do seu negócio.', 'Começar agora',
      [sec('Por que escolher', 'Tudo que você precisa em uma só plataforma.', { fg: '#fff', accent: '#22d3ee', muted: '#16324a' })]
    ),
  },
  {
    id: 'ecommerce', name: 'Loja virtual', category: 'ecommerce', description: 'Venda produtos online.',
    doc: base(
      { bg: '#0d1117', fg: '#e6edf3', accent: '#f472b6', muted: '#30363d' },
      'LOJA', ['Produtos', 'Ofertas', 'Contato'],
      'Descubra produtos que você vai amar.', 'Curadoria especial, qualidade garantida e entrega rápida.', 'Ver produtos',
      [sec('Mais vendidos', 'Os favoritos dos nossos clientes.', { fg: '#e6edf3', accent: '#f472b6', muted: '#30363d' })]
    ),
  },
  {
    id: 'agency', name: 'Agência', category: 'agency', description: 'Serviços criativos e digitais.',
    doc: base(
      { bg: '#0a0a0a', fg: '#ffffff', accent: '#a855f7', muted: '#262626' },
      'AGÊNCIA', ['Serviços', 'Cases', 'Time'],
      'Ideias que movem marcas.', 'Estratégia, criação e mídia para o seu negócio ir mais longe.', 'Iniciar projeto',
      [sec('O que fazemos', 'Soluções completas para todos os canais.', { fg: '#fff', accent: '#a855f7', muted: '#262626' })]
    ),
  },
  {
    id: 'blog', name: 'Blog', category: 'blog', description: 'Artigos e conteúdo.',
    doc: base(
      { bg: '#fafafa', fg: '#18181b', accent: '#0ea5e9', muted: '#e4e4e7' },
      'BLOG', ['Artigos', 'Categorias', 'Sobre'],
      'Conteúdo que faz a diferença.', 'Ideias, histórias e conhecimento para o seu dia a dia.', 'Ler artigos',
      [sec('Últimas publicações', 'Conteúdo fresco toda semana.', { fg: '#18181b', accent: '#0ea5e9', muted: '#e4e4e7' })]
    ),
  },
  {
    id: 'blank', name: 'Em branco', category: 'blank', description: 'Comece do zero com uma página limpa.',
    doc: {
      version: 1, meta: { title: 'Meu site' },
      root: n('root', 'Página', {
        styles: { background: S('#ffffff'), color: S('#111111') },
        children: [n('section', 'Seção', {
          styles: { padding: S('100px 24px'), textAlign: S('center') },
          children: [
            n('heading', 'Título', { text: 'Seu título aqui', styles: { fontSize: S('48px'), fontWeight: S('800') } }),
            n('text', 'Texto', { text: 'Comece editando este texto.', styles: { fontSize: S('18px') } }),
          ],
        })],
      }),
    },
  },
];
