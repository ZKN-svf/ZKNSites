// ============================================================
// UtilitÃ¡rios da API (auth, validaÃ§Ã£o, respostas)
// ============================================================
import type { Env } from './env';

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      ...headers,
    },
  });
}

export function err(message: string, status = 400, code?: string): Response {
  return json({ ok: false, message, ...(code ? { code } : {}) }, status);
}

export function uid(prefix = ''): string {
  return prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

export function now(): number { return Date.now(); }

export function slugify(s: string): string {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 40) || 'site';
}

export async function hashPassword(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as any, iterations: 100000, hash: 'SHA-256' }, key, 256
  );
  const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$100000$${hex(salt.buffer)}$${hex(bits)}`;
}

export async function verifyPassword(senha: string, hash: string): Promise<boolean> {
  try {
    const [alg, iterStr, saltHex, hashHex] = hash.split('$');
    if (alg !== 'pbkdf2') return false;
    const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(x => parseInt(x, 16)));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: salt as any, iterations: Number(iterStr), hash: 'SHA-256' }, key, 256
    );
    const hex = [...new Uint8Array(bits)].map(x => x.toString(16).padStart(2, '0')).join('');
    return hex === hashHex;
  } catch { return false; }
}

export function makeToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function getIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for') || 'unknown';
}

// Rate limiting simples via KV (por IP + aÃ§Ã£o)
export async function rateLimit(env: Env, key: string, limit: number, windowSec: number): Promise<boolean> {
  try {
    const k = `ratelimit:${key}`;
    const raw = await env.CACHE.get(k);
    const { count, reset } = raw ? JSON.parse(raw) : { count: 0, reset: now() + windowSec * 1000 };
    if (now() > reset) {
      await env.CACHE.put(k, JSON.stringify({ count: 1, reset: now() + windowSec * 1000 }), { expirationTtl: windowSec });
      return true;
    }
    if (count >= limit) return false;
    await env.CACHE.put(k, JSON.stringify({ count: count + 1, reset }), { expirationTtl: windowSec });
    return true;
  } catch { return true; } // falha aberta no rate limit
}

export async function audit(env: Env, userId: string | null, action: string, targetType?: string, targetId?: string, details?: unknown, ip?: string) {
  try {
    await env.DB.prepare(
      'INSERT INTO audit_logs (id,user_id,action,target_type,target_id,details,ip,created_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(uid('a_'), userId, action, targetType || null, targetId || null,
      details ? JSON.stringify(details) : null, ip || null, now()).run();
  } catch (e) { console.error('[audit]', e); }
}

export function sanitizeHtml(s: string): string {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}
