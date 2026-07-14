-- ============================================================================
-- Situación del estudiante (para no mensajear como "ausentes" a quienes no
-- se conectan por razones legítimas).
--   activo             → único que recibe la campaña de retención.
--   egresado           → terminó la malla (etiqueta manual o derivada).
--   retiro_permanente  → IW (StudentAccounts.Withdrawal* con resolución IW).
--   retiro_temporal    → LOA (etiqueta manual; SystemActiva no lo registra
--                        como retiro, la cuenta sigue abierta).
--   campus_socio       → estudia en el aula de un socio académico; nunca
--                        conecta a NUESTRO Moodle (etiqueta manual por programa).
--
--   situation_source:
--     'auto'   → puesta por el sync de retiros (N8N). El sync puede sobrescribirla.
--     'manual' → puesta por un humano en el ERP. El sync NO la toca.
-- Ejecutar en Supabase.
-- ============================================================================
alter table academic_students add column if not exists situation text not null default 'activo';
alter table academic_students add column if not exists situation_source text not null default 'auto';
alter table academic_students add column if not exists withdrawal_date date;
alter table academic_students add column if not exists withdrawal_resolution text;

create index if not exists academic_students_situation_idx on academic_students(situation);
