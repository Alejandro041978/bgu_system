-- Bonos (2026-07-25) — beneficio ADICIONAL a la beca/descuentos.
-- Regla del usuario: el bono se almacena como PORCENTAJE y se aplica NO al
-- precio oficial, sino a lo que queda DESPUÉS de la beca:
--   afterBeca = precio_lista − ahorro_TC − beca
--   bono      = afterBeca × pct
--   Total Tuition = afterBeca − bono
-- El monto es SIEMPRE derivado (nunca se guarda). Un bono por matrícula.
-- Debe ingresarse el MOTIVO. Editable y eliminable (lápiz / basurero).
-- Ejecutar con "Run and enable RLS".
create table if not exists bonuses (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  student_id    uuid not null,
  program_id    uuid,
  percentage    numeric not null,          -- 0 < pct <= 100 (el dato)
  reason        text,                       -- motivo del bono (obligatorio en el alta)
  granted_at    date not null default current_date,
  granted_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists bonuses_enrollment_idx on bonuses (enrollment_id);
create index if not exists bonuses_student_idx    on bonuses (student_id);
