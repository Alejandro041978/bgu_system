-- Marca los estudiantes que NO tienen cuenta en Moodle (confirmado por el
-- diagnóstico). Sin cuenta = sin acceso que restringir → se excluyen del plan de
-- suspensión para que no queden colgados como "A suspender". Ejecutar en Supabase.
alter table academic_students add column if not exists moodle_no_account boolean not null default false;
