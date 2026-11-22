export interface Env {
  DB: D1Database;
  ASSETS: R2Bucket;
  CACHE: KVNamespace;
  PUBLISHED: KVNamespace;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  APP_NAME: string;
  PUBLISH_BASE_DOMAIN: string;
  PUBLISH_PREVIEW_URL?: string;
  BUILDER_URL: string;
}
