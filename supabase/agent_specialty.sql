-- Especialidad de la asesora (texto libre): el motor de asignación la lee
-- para desempatar por CONTENIDO cuando varias asesoras cubren la misma
-- categoría de programas.
alter table agent_skills add column if not exists specialty text;
