-- Becas (2026-07-23) — Fase 2 del sistema de precios regulados.
-- Regla del usuario: la beca SE ALMACENA COMO PORCENTAJE (dato fijo). El
-- monto es SIEMPRE DERIVADO: % × precio de lista vigente de la matrícula —
-- si la base cambia (créditos consumidos → cambia el precio de lista), el
-- monto se mueve solo; el porcentaje jamás. NO se guarda monto en tabla.
-- Auditoría: lista − beca = lo que debe pagar.
-- Una beca ACTIVA por matrícula; se puede revocar (queda el rastro).
-- Ejecutar con "Run and enable RLS".
create table if not exists scholarships (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  student_id uuid not null,
  program_id uuid,
  percentage numeric not null,           -- 0 < pct <= 100 (el dato)
  granted_at date not null default current_date,
  granted_by text,
  note text,
  revoked_at timestamptz,
  revoked_by text,
  created_at timestamptz not null default now()
);
create index if not exists scholarships_enrollment_idx on scholarships (enrollment_id);
create index if not exists scholarships_student_idx on scholarships (student_id);
