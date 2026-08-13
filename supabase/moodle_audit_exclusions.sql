-- ---------------------------------------------------------------------------
-- Categorías de Moodle que el Auditor del Campus no debe mirar.
--
-- El auditor recorre TODAS las aulas y las mide contra la política: que las
-- ponderaciones sumen 100% y la escala esté sobre 100. Eso está bien para un
-- aula que enseña, y no significa nada para un aula en construcción, una en
-- desuso o una demo sin valor curricular. Medirlas produce incumplimientos que
-- nadie va a arreglar, y un incumplimiento que nadie va a arreglar entrena al
-- equipo a ignorar la lista entera.
--
-- eLearning agrupa en Moodle lo que no vale, y aquí se declara esa categoría.
-- Las aulas no desaparecen: se cuentan aparte, para que excluir sea una
-- decisión visible y no un silencio.
--
-- La ruta se guarda como la muestra Moodle ("Padre / Hija"). La coincidencia es
-- por tramos contiguos, igual que el filtro por familia del auditor: declarar
-- "Sin valor curricular" excluye también "Sin valor curricular / Demos", y una
-- ruta guardada antes de que la categoría se moviera sigue encontrando sus
-- aulas dentro de la ruta nueva.
-- ---------------------------------------------------------------------------

create table if not exists public.moodle_audit_exclusions (
  ruta       text primary key,
  nota       text,
  created_at timestamptz not null default now(),
  created_by uuid
);

alter table public.moodle_audit_exclusions enable row level security;

grant select, insert, update, delete on public.moodle_audit_exclusions to service_role;

comment on table public.moodle_audit_exclusions is
  'Categorías de Moodle excluidas del Auditor del Campus (aulas en construcción, en desuso o demos). Se administra desde el propio auditor y solo por superadministrador: quien define qué no se mide no puede ser quien responde por lo medido.';
