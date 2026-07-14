-- ============================================================================
-- Seguimiento / retención de estudiantes.
--   Una fila por estudiante, recalculada a diario por el cron:
--     deuda, último ingreso al ERP, última conexión a Moodle (aula),
--     última actividad completada, días de inactividad y nivel de riesgo.
-- Ejecutar en Supabase.
-- ============================================================================
create table if not exists student_tracking (
  student_id              uuid primary key references academic_students(id),
  balance                 numeric,                 -- deuda (cargos - pagos)
  last_erp_login          timestamptz,             -- auth.users.last_sign_in_at
  last_moodle_access      timestamptz,             -- última conexión al aula (Moodle)
  last_completed_activity timestamptz,             -- última actividad completada (Moodle) — Fase 1.5
  inactivity_days         integer,                 -- días desde la última conexión a Moodle
  risk_level              text,                    -- active | nudge7 | warn14 | never
  last_message_level      text,                    -- último mensaje enviado (Fase 2)
  last_message_at         timestamptz,             -- (Fase 2)
  updated_at              timestamptz not null default now()
);
create index if not exists student_tracking_risk_idx on student_tracking(risk_level);
