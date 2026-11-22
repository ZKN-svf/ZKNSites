// ============================================================
// Autenticação: cadastro, login, logout, verificação, recuperação
// ============================================================
import type { Env } from './env';
import { json, err, uid, now, hashPassword, verifyPassword, makeToken, hashToken, getIp, rateLimit, audit } from './lib';

const SESSION_TTL = 30 * 24 * 3600 * 1000; // 30 dias

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = makeToken();
  const hash = await hashToken(token);
  await env.DB.prepare(
    'INSERT INTO sessions (id,user_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?)'
  ).bind(uid('s_'), userId, hash, now() + SESSION_TTL, now()).run();
  return token;
}

export async function currentUser(env: Env, req: Request): Promise<any | null> {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const hash = await hashToken(token);
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.suspended = 0`
  ).bind(hash, now()).first<any>();
  return row || null;
}

export async function requireUser(env: Env, req: Request): Promise<any | Response> {
  const u = await currentUser(env, req);
  if (!u) return err('Não autorizado. Faça login.', 401, 'UNAUTHORIZED');
  return u;
}

export async function requireAdmin(env: Env, req: Request): Promise<any | Response> {
  const u = await currentUser(env, req);
  if (!u) return err('Não autorizado.', 401, 'UNAUTHORIZED');
  if (u.role !== 'admin') return err('Acesso restrito a administradores.', 403, 'FORBIDDEN');
  return u;
}

function validEmail(v: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

// ---------- ROTAS ----------
export async function handleAuth(path: string, method: string, req: Request, env: Env, body: any): Promise<Response | null> {
  const ip = getIp(req);

  if (path === '/auth/register' && method === 'POST') {
    if (!await rateLimit(env, `reg:${ip}`, 10, 3600)) return err('Muitas tentativas. Tente depois.', 429);
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const senha = String(body.password || '');
    if (!validEmail(email)) return err('E-mail inválido.');
    if (name.length < 2) return err('Informe seu nome.');
    if (senha.length < 8) return err('Senha mínima de 8 caracteres.');
    const exists = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (exists) return err('E-mail já cadastrado.', 409);

    const id = uid('u_');
    const hash = await hashPassword(senha);
    const verifyToken = makeToken();
    await env.DB.prepare(
      `INSERT INTO users (id,email,name,password_hash,email_verified,verification_token,plan,role,created_at,updated_at)
       VALUES (?,?,?,?,0,?,'free','user',?,?)`
    ).bind(id, email, name, hash, verifyToken, now(), now()).run();

    const verifyUrl = `${env.BUILDER_URL.replace(/\/+$/, '')}/verify-email.html?token=${verifyToken}`;
    if (env.RESEND_API_KEY) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'ZKNSites <no-reply@zknsites.com>', to: [email],
            subject: 'Verifique seu e-mail — ZKNSites',
            html: `<p>Olá, ${name}!</p><p>Confirme seu e-mail:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
          }),
        });
      } catch (e) { console.error('[email]', e); }
    }
    await audit(env, id, 'register', 'user', id, { email }, ip);
    const token = await createSession(env, id);
    return json({ ok: true, token, user: { id, email, name, plan: 'free', role: 'user', email_verified: 0 } });
  }

  if (path === '/auth/login' && method === 'POST') {
    if (!await rateLimit(env, `login:${ip}`, 20, 900)) return err('Muitas tentativas. Aguarde.', 429);
    const email = String(body.email || '').trim().toLowerCase();
    const senha = String(body.password || '');
    const row = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<any>();
    if (!row || !await verifyPassword(senha, row.password_hash)) return err('E-mail ou senha incorretos.', 401, 'INVALID_CREDENTIALS');
    if (row.suspended) return err('Conta suspensa.', 403, 'SUSPENDED');
    const token = await createSession(env, row.id);
    await audit(env, row.id, 'login', 'user', row.id, {}, ip);
    return json({
      ok: true, token,
      user: { id: row.id, email: row.email, name: row.name, plan: row.plan, role: row.role, email_verified: row.email_verified },
    });
  }

  if (path === '/auth/logout' && method === 'POST') {
    const u = await currentUser(env, req);
    const auth = req.headers.get('Authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hashToken(token)).run();
    if (u) await audit(env, u.id, 'logout', 'user', u.id, {}, ip);
    return json({ ok: true });
  }

  if (path === '/auth/verify-email' && method === 'POST') {
    const token = String(body.token || '').trim();
    const row = await env.DB.prepare('SELECT id FROM users WHERE verification_token = ?').bind(token).first<any>();
    if (!row) return err('Token inválido ou expirado.', 400);
    await env.DB.prepare('UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = ? WHERE id = ?').bind(now(), row.id).run();
    return json({ ok: true });
  }

  if (path === '/auth/forgot-password' && method === 'POST') {
    if (!await rateLimit(env, `forgot:${ip}`, 5, 3600)) return err('Muitas tentativas.', 429);
    const email = String(body.email || '').trim().toLowerCase();
    const row = await env.DB.prepare('SELECT id, name FROM users WHERE email = ?').bind(email).first<any>();
    if (row) {
      const reset = makeToken();
      await env.DB.prepare('UPDATE users SET reset_token = ?, reset_expires_at = ?, updated_at = ? WHERE id = ?')
        .bind(reset, now() + 3600000, now(), row.id).run();
      if (env.RESEND_API_KEY) {
        const url = `${env.BUILDER_URL.replace(/\/+$/, '')}/reset-password.html?token=${reset}`;
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'ZKNSites <no-reply@zknsites.com>', to: [email], subject: 'Redefinir senha', html: `<p><a href="${url}">Redefinir senha</a></p>` }),
          });
        } catch (e) { console.error('[email]', e); }
      }
    }
    return json({ ok: true, message: 'Se o e-mail existir, você receberá as instruções.' });
  }

  if (path === '/auth/reset-password' && method === 'POST') {
    const token = String(body.token || '').trim();
    const senha = String(body.password || '');
    if (senha.length < 8) return err('Senha mínima de 8 caracteres.');
    const row = await env.DB.prepare('SELECT id FROM users WHERE reset_token = ? AND reset_expires_at > ?').bind(token, now()).first<any>();
    if (!row) return err('Token inválido ou expirado.', 400);
    await env.DB.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL, updated_at = ? WHERE id = ?')
      .bind(await hashPassword(senha), now(), row.id).run();
    return json({ ok: true });
  }

  if (path === '/auth/me' && method === 'GET') {
    const u = await requireUser(env, req);
    if (u instanceof Response) return u;
    return json({ ok: true, user: { id: u.id, email: u.email, name: u.name, plan: u.plan, role: u.role, email_verified: u.email_verified } });
  }

  return null;
}
