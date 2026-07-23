-- Becas (2026-07-23) — Fase 2 del sistema de precios regulados.
-- Otorgamiento por matrícula (estudiante × programa) con PORCENTAJE sobre el
-- precio de lista congelado; el monto se congela al otorgar (snapshot, como
-- tarifas y comisiones). Auditoría: lista − beca = lo que debe pagar.
-- Una beca ACTIVA por matrícula; se puede revocar (queda el rastro).
-- Ejecutar con "Run and enable RLS".
create table if not exists scholarships (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  student_id uuid not null,
  program_id uuid,
  percentage numeric not null,           -- 0 < pct <= 100
  amount numeric,                        -- snapshot: list_price × pct al otorgar
  granted_at date not null default current_date,
  granted_by text,
  note text,
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz not null default now()
);
create index if not exists scholarships_enrollment_idx on scholarships (enrollment_id);
create index if not exists scholarships_student_idx on scholarships (student_id);
