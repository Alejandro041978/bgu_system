-- ============================================================================
-- Embudos de venta independientes (multi-bot).
--   Un embudo pertenece a un bot de ventas y vende una CATEGORÍA de productos
--   o productos específicos. NO depende de convocatorias (persisten en el tiempo).
--   La convocatoria es una ETIQUETA del lead (obligatoria al llegar a 'inscrito').
-- Ejecutar en Supabase.
-- ============================================================================

-- Macarena: segundo bot de ventas (Educación Continua). Número de WhatsApp luego.
insert into bots (key, name, role, prompt)
values ('macarena', 'Macarena', 'ventas', '')
on conflict (key) do nothing;

create table if not exists sales_funnels (
  id                uuid primary key default gen_random_uuid(),
  bot_key           text not null references bots(key),
  name              text not null,
  scope_category_id uuid references academic_programs_category(id),  -- categoría que vende
  scope_program_ids jsonb not null default '[]'::jsonb,              -- o productos específicos
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists sales_funnels_bot_idx on sales_funnels(bot_key);

-- Lead → embudo, y etiqueta de convocatoria (se asigna al inscribirse)
alter table sales_leads add column if not exists funnel_id       uuid references sales_funnels(id);
alter table sales_leads add column if not exists convocatoria_id uuid references convocatorias(id);
create index if not exists sales_leads_funnel_idx on sales_leads(funnel_id);

-- Embudos base (el usuario asigna la categoría/productos desde la configuración)
insert into sales_funnels (bot_key, name, sort_order)
select v.bot_key, v.name, v.sort_order
from (values
  ('antonella', 'Bachelor', 1),
  ('antonella', 'Maestría', 2),
  ('antonella', 'Doctorado', 3),
  ('macarena',  'Educación Continua', 1)
) as v(bot_key, name, sort_order)
where not exists (
  select 1 from sales_funnels f where f.bot_key = v.bot_key and f.name = v.name
);
