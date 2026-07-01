-- Meses Calidad
create table if not exists kpi_periods (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text default 'active' check (status in ('active', 'closed', 'draft')),
  created_at timestamptz default now()
);

-- KPI definitions por colaborador por período
create table if not exists kpi_definitions (
  id uuid default gen_random_uuid() primary key,
  period_id uuid not null references kpi_periods(id) on delete cascade,
  employee_id uuid not null references hr_employees(id) on delete cascade,
  name text not null,
  metric_type text not null check (metric_type in (
    'zoho_tickets_resolved',
    'zoho_resolution_time',
    'zoho_satisfaction',
    'manual'
  )),
  target_value numeric not null,
  unit text,
  -- 'gte' = debe ser >= target (ej. tickets resueltos)
  -- 'lte' = debe ser <= target (ej. tiempo de resolución)
  comparison text default 'gte' check (comparison in ('gte', 'lte')),
  sort_order int default 0,
  created_at timestamptz default now()
);

-- Resultados cacheados (se recalculan al pedir)
create table if not exists kpi_results (
  id uuid default gen_random_uuid() primary key,
  period_id uuid not null references kpi_periods(id) on delete cascade,
  employee_id uuid not null references hr_employees(id) on delete cascade,
  kpi_definition_id uuid not null references kpi_definitions(id) on delete cascade,
  current_value numeric,
  met boolean,
  calculated_at timestamptz default now(),
  unique(kpi_definition_id)
);

-- Vista resumen por colaborador y período
create or replace view kpi_employee_summary as
select
  kd.period_id,
  kd.employee_id,
  e.full_name,
  e.email,
  e.position,
  count(kd.id) as total_kpis,
  count(kr.id) filter (where kr.met = true) as met_kpis,
  case
    when count(kd.id) = 0 then false
    when count(kr.id) filter (where kr.met = true) = count(kd.id) then true
    else false
  end as has_bonus,
  max(kr.calculated_at) as last_calculated
from kpi_definitions kd
join hr_employees e on e.id = kd.employee_id
left join kpi_results kr on kr.kpi_definition_id = kd.id
group by kd.period_id, kd.employee_id, e.full_name, e.email, e.position;

alter table kpi_periods enable row level security;
alter table kpi_definitions enable row level security;
alter table kpi_results enable row level security;
