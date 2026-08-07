-- ===========================================================================
-- Plantillas de facturación v2: por PROGRAMA/CATEGORÍA, no por convocatoria
--
-- El modelo viejo pedía una plantilla por cada par (programa, convocatoria).
-- Con 63 programas y decenas de convocatorias, eso son cientos de filas que
-- decir lo mismo: 345 pares tenían estudiantes y ninguna plantilla. Y los
-- datos confirman que la dimensión sobraba — de las 4 plantillas existentes,
-- NINGÚN programa cambiaba de precio entre convocatorias.
--
-- Ahora una plantilla se define una vez y se ata a varios programas o a una
-- categoría entera. Lo que dependía de la convocatoria era una sola cosa —la
-- fecha de la primera cuota— y esa se CALCULA:
--
--   primera cuota = día 1 del mes siguiente a (inicio de clases + 20 días)
--
--   inicio 18 abril  → 8 mayo      → 1 de junio
--   inicio 4 noviembre → 24 noviembre → 1 de diciembre
--
-- Y si la primera vence el día 1, todas vencen el día 1: el campo "día de
-- vencimiento" desaparece por innecesario.
--
-- La tabla vieja NO se borra. Queda intacta por si hay que volver atrás.
-- ===========================================================================

create table if not exists billing_templates (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  currency             text not null default 'USD',
  registration_fee     numeric not null default 0,
  registration_concept integer,             -- charge_type de la matrícula
  installments_count   integer not null default 0,
  installment_amount   numeric not null default 0,
  installment_concept  integer,             -- charge_type de las cuotas
  active               boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- A qué se aplica cada plantilla. Una fila = un programa O una categoría.
create table if not exists billing_template_targets (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references billing_templates(id) on delete cascade,
  program_id  uuid references academic_programs(id) on delete cascade,
  category_id uuid references academic_programs_category(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint uno_u_otro check ((program_id is not null) <> (category_id is not null))
);

-- Un programa (o una categoría) NO puede tener dos plantillas: si las tuviera,
-- "cuál se aplica" dejaría de tener respuesta y la elegiría el azar del orden
-- de la consulta.
create unique index if not exists billing_target_program_idx
  on billing_template_targets (program_id) where program_id is not null;
create unique index if not exists billing_target_category_idx
  on billing_template_targets (category_id) where category_id is not null;
create index if not exists billing_target_template_idx on billing_template_targets (template_id);

-- ── Migración de las 4 plantillas existentes ───────────────────────────────
-- Se agrupan por su contenido económico: dos plantillas distintas, no cuatro.
insert into billing_templates (name, currency, registration_fee, registration_concept,
                               installments_count, installment_amount, installment_concept)
select distinct on (registration_fee, registration_concept, installments_count, installment_amount, installment_concept, currency)
       'Migrada · ' || registration_fee::text || ' + ' || installments_count::text || '×' || installment_amount::text,
       currency, registration_fee, registration_concept,
       installments_count, installment_amount, installment_concept
  from billing_plans
 where program_id is not null
   and not exists (select 1 from billing_templates)   -- solo la primera vez
 order by registration_fee, registration_concept, installments_count, installment_amount, installment_concept, currency;

-- Cada programa que tenía plantilla queda atado a la que le corresponde.
insert into billing_template_targets (template_id, program_id)
select distinct t.id, p.program_id
  from billing_plans p
  join billing_templates t
    on t.registration_fee     = p.registration_fee
   and t.installments_count   = p.installments_count
   and t.installment_amount   = p.installment_amount
   and t.currency             = p.currency
   and t.registration_concept is not distinct from p.registration_concept
   and t.installment_concept  is not distinct from p.installment_concept
 where p.program_id is not null
on conflict do nothing;

alter table billing_templates enable row level security;
alter table billing_template_targets enable row level security;
grant all on table billing_templates to service_role;
grant all on table billing_template_targets to service_role;

-- ── Verificación ───────────────────────────────────────────────────────────
select 'plantillas creadas' as control, count(*)::text as valor from billing_templates
union all
select 'programas atados', count(*)::text from billing_template_targets where program_id is not null
union all
select 'categorías atadas', count(*)::text from billing_template_targets where category_id is not null
union all
select 'programas CON estudiantes y SIN plantilla (ni por categoría)', count(*)::text from (
  select p.id from academic_programs p
    join academic_student_enrollments e on e.program_id = p.id
   where not exists (select 1 from billing_template_targets t where t.program_id = p.id)
     and not exists (select 1 from billing_template_targets t where t.category_id = p.category_id)
   group by p.id) x;
