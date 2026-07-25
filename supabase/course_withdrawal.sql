-- Registro curricular — retiro de asignatura (2026-07-25).
-- Retirar una asignatura SIN calificaciones: marca la inscripción como retirada
-- (no se borra, queda el rastro) y baja el consumo de créditos. La deuda se
-- recalcula bajando el Total Tuition (list_price de la matrícula −= tarifa×créditos).
-- El ajuste de cuotas lo hacen los humanos por ahora. Ejecutar en Supabase.
alter table academic_grades add column if not exists withdrawn_at timestamptz;
alter table academic_grades add column if not exists withdrawn_by text;
