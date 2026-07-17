-- Convocatoria → carruseles de ENTRADA.
-- Una convocatoria cubre una categoría con varios programas, así que puede
-- vincular un carrusel de entrada POR PROGRAMA (la API reemplaza si se vincula
-- otro del mismo programa). El matriculado por la convocatoria en el programa X
-- entra al carrusel vinculado de X.
create table if not exists convocatoria_groups (
  convocatoria_id uuid not null references convocatorias(id) on delete cascade,
  group_id uuid not null references academic_groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (convocatoria_id, group_id)
);

alter table convocatoria_groups enable row level security;
