// ============================================================
// NexasPay — cash-in via relay (mesmo padrão da ZKNbet, isolado aqui)
// Credenciais ficam somente em secrets do Worker.
// ============================================================
import type { Env } from './env';
import { uid, now } from './lib';

const STATUS_PAGO = new Set(['PAID', 'COMPLETED', 'CONFIRMED', 'SETTLED']);

function relayConfigurado(env: Env): boolean {
  return Boolean(env.NEXAS_RELAY_URL && env.NEXAS_RELAY_TOKEN);
}
export function gatewayConfigurado(env: Env): boolean { return relayConfigurado(env); }

async function chamarRelay(env: Env, payload: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  try {
    const res = await fetch(String(env.NEXAS_RELAY_URL).replace(/\/+$/, '') + '/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Relay-Token': String(env.NEXAS_RELAY_TOKEN) },
      body: JSON.stringify(payload),
    });
    const texto = await res.text();
    let json: any = null;
    try { json = JSON.parse(texto); } catch { json = { message: texto.slice(0, 200) }; }
    return { ok: res.ok, status: res.status, data: json || {} };
  } catch (e: any) {
    return { ok: false, status: 502, data: { message: 'Falha ao chamar relay: ' + e.message } };
  }
}

export interface CheckoutResult {
  ok: boolean;
  identifier?: string;
  transactionId?: string;
  pixCode?: string;
  pixImage?: string | null;
  status?: string;
  mensagem?: string;
}

// Cria cobrança PIX para liberar um site
export async function criarCobranca(env: Env, { amount, projectId, userEmail, userName, userDocument }: {
  amount: number; projectId: string; userEmail: string; userName: string; userDocument?: string;
}): Promise<CheckoutResult> {
  if (!relayConfigurado(env)) return { ok: false, mensagem: 'Gateway de pagamento não configurado.' };
  const externalId = `zknsite_${uid('')}`.slice(0, 40);
  const postbackUrl = `${env.BUILDER_URL.replace(/\/+$/, '')}/api/webhook/nexas`;

  // A Nexas exige payer.name — nunca enviar vazio.
  const nome = String(userName || '').trim() || userEmail.split('@')[0] || 'Cliente ZKNSites';
  const dados: any = {
    amount: Number(amount).toFixed(2),
    external_id: externalId,
    description: 'ZKNSites — Publicação de site',
    postbackUrl,
    payer: { name: nome.slice(0, 120), email: userEmail },
  };
  const doc = String(userDocument || '').replace(/\D/g, '');
  if (doc.length === 11 || doc.length === 14) dados.payer.document = doc;

  const r = await chamarRelay(env, { action: 'api', method: 'POST', path: '/v2/pix/qrcode', body: dados, idempotencyKey: 'zknsite_' + projectId + '_' + externalId });
  if (!r.ok) return { ok: false, mensagem: r.data?.message || 'Erro ao gerar PIX.' };
  const code = r.data.pixCode || r.data.qr_code || r.data.qrcode || r.data.code || null;
  if (!code) return { ok: false, mensagem: 'Gateway não devolveu o código PIX.' };

  await env.DB.prepare(
    'INSERT INTO payments (id,user_email,project_id,external_id,transaction_id,amount,status,pix_code,created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(uid('pay_'), userEmail, projectId, externalId, r.data.transactionId || null, amount, 'PENDING', code, now()).run();

  return {
    ok: true,
    identifier: externalId,
    transactionId: r.data.transactionId || r.data.transaction_id || null,
    pixCode: code,
    pixImage: r.data.qrcodeImage || r.data.qr_code_image || null,
    status: r.data.status || 'PENDING',
  };
}

export async function consultarPagamento(env: Env, externalId: string): Promise<{ pago: boolean; status: string }> {
  if (!relayConfigurado(env)) return { pago: false, status: 'SEM_GATEWAY' };
  const r = await chamarRelay(env, { action: 'api', method: 'GET', path: `/v2/pix/status?external_id=${encodeURIComponent(externalId)}` });
  const status = String(r.data?.status || r.data?.transactionStatus || '').toUpperCase();
  return { pago: STATUS_PAGO.has(status), status: status || 'PENDING' };
}

export async function confirmarPagamento(env: Env, externalId: string): Promise<boolean> {
  const row = await env.DB.prepare('SELECT * FROM payments WHERE external_id = ?').bind(externalId).first<any>();
  if (!row || row.status === 'PAID') return false;
  const { pago, status } = await consultarPagamento(env, externalId);
  if (!pago) return false;
  await env.DB.prepare("UPDATE payments SET status='PAID', paid_at=? WHERE external_id=?").bind(now(), externalId).run();

  // Libera o projeto: plano pro + publica
  const p = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(row.project_id).first<any>();
  if (p) {
    await env.DB.prepare("UPDATE projects SET plan='pro', status='published', published_at=? WHERE id=?").bind(now(), p.id).run();
    // html já vem do publish; garante que o preview reflita o plano
    const raw = await env.PUBLISHED.get(`site:${p.slug}`);
    if (raw) {
      const site = JSON.parse(raw);
      site.plan = 'pro'; site.paidAt = now();
      await env.PUBLISHED.put(`site:${p.slug}`, JSON.stringify(site));
    }
  }
  return true;
}
