-- Operaciones extraídas de Zoho Books (2026-07-23): movimientos de las
-- cuentas "Returns and Allowances", "Corporate Sales" e "Individual Sales",
-- traídos al ERP para gestionarlos (estado + nota). Idempotente por
-- zoho_key (id de transacción o hash estable de sus campos).
-- Ejecutar con "Run and enable RLS".
create table if not exists books_operations (
  id uuid primary key default gen_random_uuid(),
  zoho_key text not null unique,
  account_name text not null,
  txn_date date,
  txn_type text,
  reference text,
  contact_name text,
  description text,
  debit numeric,
  credit numeric,
  amount numeric,
  raw jsonb,
  gestion_status text not null default 'pendiente',   -- pendiente | gestionada
  gestion_note text,
  gestion_by text,
  gestion_at timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists books_operations_account_idx on books_operations (account_name, txn_date desc);
create index if not exists books_operations_status_idx on books_operations (gestion_status);
