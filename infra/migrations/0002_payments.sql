-- Pagamentos de liberação de sites
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  project_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  transaction_id TEXT,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | PAID | EXPIRED
  pix_code TEXT,
  paid_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_external ON payments(external_id);
CREATE INDEX IF NOT EXISTS idx_payments_project ON payments(project_id);
CREATE INDEX IF NOT EXISTS idx_payments_email ON payments(user_email);

-- Planos: preço de liberação por plano
INSERT OR IGNORE INTO templates (id,name,category,description,thumbnail,document,premium,active,created_at)
VALUES ('__plan_pro__','Plano PRO','plan','Liberação de site com domínio próprio','', '{}', 0, 1, 0);
