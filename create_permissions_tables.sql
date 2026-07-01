-- Roles del sistema
create table if not exists roles (
  id uuid default gen_random_uuid() primary key,
  name text not null unique,  -- slug: 'director', 'agente_servicio'
  label text not null,        -- display: 'Director', 'Agente de servicio'
  created_at timestamptz default now()
);

-- Permisos por rol y página
create table if not exists role_permissions (
  id uuid default gen_random_uuid() primary key,
  role_id uuid not null references roles(id) on delete cascade,
  page_key text not null,
  can_view boolean default false,
  can_edit boolean default false,
  unique(role_id, page_key)
);

-- Rol asignado al colaborador
alter table hr_employees add column if not exists role_id uuid references roles(id) on delete set null;

-- Roles iniciales
insert into roles (name, label) values
  ('director', 'Director'),
  ('agente_servicio', 'Agente de servicio'),
  ('coordinador', 'Coordinador'),
  ('rrhh', 'RRHH')
on conflict (name) do nothing;

alter table roles enable row level security;
alter table role_permissions enable row level security;
