-- Módulo de Planeamiento Estratégico
-- Ejecutar en Supabase SQL editor (Run without RLS)

create table if not exists strategic_plan_cycles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_year int not null,
  end_year int not null,
  status text not null default 'active', -- active | superseded
  created_at timestamptz not null default now()
);

create table if not exists strategic_dimensions (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references strategic_plan_cycles(id) on delete cascade,
  code text not null, -- E1, E2, ...
  name text not null,
  description text,
  valid_from_year int not null,
  valid_to_year int,
  supersedes_id uuid references strategic_dimensions(id),
  status text not null default 'active', -- active | superseded | cancelled
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists strategic_objectives (
  id uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references strategic_dimensions(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  valid_from_year int not null,
  valid_to_year int,
  supersedes_id uuid references strategic_objectives(id),
  status text not null default 'active',
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists strategic_strategies (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references strategic_objectives(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  valid_from_year int not null,
  valid_to_year int,
  supersedes_id uuid references strategic_strategies(id),
  status text not null default 'active',
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists strategic_actions (
  id uuid primary key default gen_random_uuid(),
  strategy_id uuid not null references strategic_strategies(id) on delete cascade,
  code text not null, -- E1-AE1, ...
  name text not null,
  description text,
  start_year int,
  target_close_year int,
  progress_pct numeric default 0,
  valid_from_year int not null,
  valid_to_year int,
  supersedes_id uuid references strategic_actions(id),
  status text not null default 'active', -- active | completed | at_risk | overdue | cancelled | superseded
  change_reason text,
  created_at timestamptz not null default now()
);

create table if not exists strategic_action_responsibles (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references strategic_actions(id) on delete cascade,
  employee_id uuid not null references hr_employees(id) on delete cascade,
  role text default 'principal', -- principal | participante
  assigned_from_year int not null,
  assigned_to_year int,
  created_at timestamptz not null default now()
);

create index if not exists idx_dimensions_cycle on strategic_dimensions(cycle_id);
create index if not exists idx_dimensions_code on strategic_dimensions(code);
create index if not exists idx_objectives_dimension on strategic_objectives(dimension_id);
create index if not exists idx_strategies_objective on strategic_strategies(objective_id);
create index if not exists idx_actions_strategy on strategic_actions(strategy_id);
create index if not exists idx_responsibles_action on strategic_action_responsibles(action_id);
create index if not exists idx_responsibles_employee on strategic_action_responsibles(employee_id);
