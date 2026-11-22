// ============================================================
// ZKNSites — tipos compartilhados entre editor, API e publicador
// ============================================================

export type Breakpoint = 'desktop' | 'tablet' | 'mobile';

export type NodeType =
  | 'root' | 'section' | 'container' | 'grid' | 'columns' | 'column'
  | 'text' | 'heading' | 'image' | 'video' | 'button' | 'link'
  | 'form' | 'input' | 'textarea' | 'select' | 'checkbox' | 'label'
  | 'menu' | 'header' | 'footer' | 'card' | 'gallery' | 'testimonial'
  | 'table' | 'icon' | 'divider' | 'spacer' | 'list' | 'list-item';

export interface ResponsiveValue<T = string> {
  desktop?: T;
  tablet?: T;
  mobile?: T;
}

export interface ElementStyles {
  // layout
  width?: ResponsiveValue;
  height?: ResponsiveValue;
  minHeight?: ResponsiveValue;
  maxWidth?: ResponsiveValue;
  display?: ResponsiveValue;
  flexDirection?: ResponsiveValue;
  alignItems?: ResponsiveValue;
  justifyContent?: ResponsiveValue;
  flexWrap?: ResponsiveValue;
  gap?: ResponsiveValue;
  gridTemplateColumns?: ResponsiveValue;
  position?: ResponsiveValue;
  top?: ResponsiveValue;
  left?: ResponsiveValue;
  right?: ResponsiveValue;
  bottom?: ResponsiveValue;
  zIndex?: ResponsiveValue;
  overflow?: ResponsiveValue;
  // espaçamento
  margin?: ResponsiveValue;
  marginTop?: ResponsiveValue;
  marginRight?: ResponsiveValue;
  marginBottom?: ResponsiveValue;
  marginLeft?: ResponsiveValue;
  padding?: ResponsiveValue;
  paddingTop?: ResponsiveValue;
  paddingRight?: ResponsiveValue;
  paddingBottom?: ResponsiveValue;
  paddingLeft?: ResponsiveValue;
  // aparência
  color?: ResponsiveValue;
  background?: ResponsiveValue;
  backgroundImage?: ResponsiveValue;
  border?: ResponsiveValue;
  borderRadius?: ResponsiveValue;
  boxShadow?: ResponsiveValue;
  opacity?: ResponsiveValue;
  transform?: ResponsiveValue;
  transition?: ResponsiveValue;
  // tipografia
  fontFamily?: ResponsiveValue;
  fontSize?: ResponsiveValue;
  fontWeight?: ResponsiveValue;
  lineHeight?: ResponsiveValue;
  letterSpacing?: ResponsiveValue;
  textAlign?: ResponsiveValue;
  textTransform?: ResponsiveValue;
  textDecoration?: ResponsiveValue;
  // animação
  animation?: ResponsiveValue;
  animationDelay?: ResponsiveValue;
  // visibilidade (mobile, etc.)
  hidden?: ResponsiveValue<'true' | 'false'>;
}

export interface ElementNode {
  id: string;
  type: NodeType;
  name: string;
  tag?: string;                 // tag HTML quando aplicável
  text?: string;                // conteúdo de texto
  html?: string;                // HTML rico sanitizado
  src?: string;                 // imagem/vídeo
  href?: string;                // link
  alt?: string;
  styles: ElementStyles;
  attributes?: Record<string, string>;
  classes?: string[];
  locked?: boolean;
  hidden?: boolean;
  children?: ElementNode[];
}

export interface PageDocument {
  version: 1;
  root: ElementNode;
  meta: {
    title?: string;
    description?: string;
    favicon?: string;
    ogImage?: string;
  };
}

export interface SiteProject {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string;
  status: 'draft' | 'published';
  plan: 'free' | 'pro' | 'business';
  customDomain?: string | null;
  domainVerified: number;
  publishedAt?: number | null;
  lastEditedAt: number;
  createdAt: number;
}

export type RenderedSite = {
  html: string;
  css: string;
  meta: PageDocument['meta'];
};
