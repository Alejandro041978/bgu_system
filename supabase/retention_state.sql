-- ============================================================================
-- Estado de la campaña de retención, sobre student_tracking (una fila por
-- estudiante, que es justo lo que necesita el motor de cadencia).
--
--   commitment_date  → la fecha que el estudiante prometió volver. Es la pieza
--                      central: el éxito NO es la promesa sino la reconexión,
--                      así que se compara contra last_moodle_access.
--   do_not_contact   → pidió que no le escriban. Se respeta siempre.
--   contact_attempts → toques con plantilla (cadencia 1/3/7/14). Se reinicia
--                      cuando el estudiante responde.
-- Ejecutar en Supabase.
-- ============================================================================
alter table student_tracking add column if not exists last_outcome        text;        -- código de Camila
alter table student_tracking add column if not exists last_outcome_at     timestamptz;
alter table student_tracking add column if not exists commitment_date     date;        -- prometió volver el...
alter table student_tracking add column if not exists commitment_at       timestamptz; -- cuándo lo prometió
alter table student_tracking add column if not exists commitment_kept     boolean;     -- ¿volvió? (lo verifica el cron)
alter table student_tracking add column if not exists contact_attempts    integer not null default 0;
alter table student_tracking add column if not exists last_contact_at     timestamptz;
alter table student_tracking add column if not exists do_not_contact      boolean not null default false;

create index if not exists student_tracking_commitment_idx on student_tracking(commitment_date);
