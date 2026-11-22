# ZKNSites — Plataforma de criação de sites

SaaS funcional de criação, edição e publicação de sites, construído sobre Cloudflare.

## URLs

| Serviço | URL |
|---|---|
| Aplicação (builder) | https://zknsites-app.gabrielrobin63.workers.dev |
| API | https://zknsites-api.gabrielrobin63.workers.dev/api |
| Publicador | https://zknsites-publisher.gabrielrobin63.workers.dev |
| Preview de site publicado | `https://zknsites-publisher.gabrielrobin63.workers.dev/?preview=SLUG` |

## Infraestrutura

| Recurso | Nome / ID |
|---|---|
| D1 | `zknsites-db` — `70a46de2-b846-4ce7-b5ab-5e2b33e3cc71` |
| R2 | `zknsites-assets` |
| KV CACHE | `b9c303b0fbf14403a31a0175f01df61c` |
| KV PUBLISHED | `c4165700bf2747d7b4dc7dbc37c762f3` |
| Worker API | `zknsites-api` |
| Worker Publisher | `zknsites-publisher` |
| Worker App | `zknsites-app` |

## Estrutura

```
apps/
  builder/       API (auth, projetos, publicação, admin) + frontend
    src/         módulos TS (auth, projects, lib, index)
    public/      SPA (index.html, style.css, app.js)
  publisher/     Worker que serve sites publicados
packages/
  shared/        tipos e renderizador HTML/CSS
  components/    biblioteca de componentes (preparado)
infra/
  migrations/    0001_initial.sql
```

## Desenvolvimento

```bash
npm install
npx tsc --noEmit
npm run deploy:api
npm run deploy:publisher
cd apps/builder/public && npx wrangler deploy
```

## Domínio de publicação

Atualmente as publicações usam o preview funcional do publisher (variável `PUBLISH_PREVIEW_URL`).

Para publicar em `slug.zknsites.com`:
1. Registrar `zknsites.com` e colocá-lo na Cloudflare.
2. Configurar certificado wildcard (`*.zknsites.com`).
3. Adicionar rota no Worker publisher para `*.zknsites.com/*`.
4. Remover `PUBLISH_PREVIEW_URL` do `wrangler.toml` da API.

## Segredos

Configurados via `wrangler secret put` (nunca no código):
- `JWT_SECRET` (obrigatório)
- `RESEND_API_KEY` (opcional — verificação de e-mail)
- `CLOUDFLARE_API_TOKEN` (opcional — provisionamento de domínios)

## Status de implementação

- [x] Infraestrutura Cloudflare (D1, R2, KV, Workers)
- [x] Autenticação (cadastro, login, logout, verificação, recuperação)
- [x] Dashboard (criar, duplicar, renomear, excluir, listar)
- [x] Editor visual (drag & drop, árvore, propriedades, desfazer/refazer)
- [x] Responsividade (desktop/tablet/mobile com propriedades por breakpoint)
- [x] Autosave com debounce
- [x] Versionamento e restauração
- [x] Publicação real + despublicação
- [x] Domínios próprios (CNAME + verificação DNS via DoH)
- [x] SEO (título, descrição, favicon no HTML gerado)
- [x] Formulários (armazenamento de respostas)
- [x] Uploads R2
- [x] Painel admin (visão geral, usuários, suspensão)
- [x] Rate limiting, isolamento multi-tenant, hashes PBKDF2
- [ ] Templates no banco (preparado, seed pendente)
- [ ] IA (preparado)
- [ ] Planos/pagamentos (estrutura pronta, sem cobrança)
