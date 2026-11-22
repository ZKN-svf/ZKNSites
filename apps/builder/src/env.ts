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
  NEXAS_RELAY_URL?: string;
  NEXAS_RELAY_TOKEN?: string;
  AI: Ai;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
}
