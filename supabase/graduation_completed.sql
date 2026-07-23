-- Fecha de CULMINACIÓN del programa (cuando quedó aprobada la última
-- asignatura de la malla) — distinta de detected_at (cuándo la detectó el
-- ERP) y de titulado_at (cuándo recibió su título, que puede ser años
-- después). Fuentes: registros (CSV oficial de egresos) | exacta (fecha real
-- de la nota que cerró la malla) | estimada (fin del bloque académico de la
-- última asignatura, herencia Activa) | manual.
-- Ejecutar con "Run and enable RLS".
alter table student_graduations add column if not exists completed_at date;
alter table student_graduations add column if not exists completed_source text;
