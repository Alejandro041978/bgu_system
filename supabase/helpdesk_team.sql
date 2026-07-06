-- ============================================================================
-- Equipo Helpdesk: marcar colaboradores como agentes + dimensión de categorías en skills.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

-- Marcador de colaborador con acceso al helpdesk (como is_faculty)
alter table hr_employees add column if not exists is_helpdesk boolean not null default false;

-- Dimensión adicional de skill: categorías de programa (Master, Bachelor, Doctorado…)
alter table agent_skills add column if not exists categories text[] not null default '{}';
