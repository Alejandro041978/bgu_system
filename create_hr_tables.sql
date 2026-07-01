-- Ejecutar en Supabase SQL Editor: https://supabase.com/dashboard/project/qpwhefuenpenoeujmplp/sql

create table if not exists hr_employees (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  email text not null unique,
  phone text,
  position text,
  employee_type text not null check (employee_type in ('direct', 'contractor', 'external')),
  document_type text check (document_type in ('dni', 'passport', 'ce', 'other')),
  document_number text,
  birth_date date,
  address text,
  notes text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists hr_contracts (
  id uuid default gen_random_uuid() primary key,
  employee_id uuid not null references hr_employees(id) on delete cascade,
  contract_type text not null check (contract_type in ('indefinite', 'fixed_term', 'services', 'internship')),
  position text not null,
  start_date date not null,
  end_date date,
  salary numeric(12,2),
  currency text default 'PEN',
  file_url text,
  notes text,
  created_at timestamptz default now()
);

-- Vista para saber si un empleado está activo (tiene contrato vigente)
create or replace view hr_employees_with_status as
select
  e.*,
  (
    select c.id from hr_contracts c
    where c.employee_id = e.id
      and c.start_date <= current_date
      and (c.end_date is null or c.end_date >= current_date)
    order by c.start_date desc
    limit 1
  ) as active_contract_id,
  (
    select c.position from hr_contracts c
    where c.employee_id = e.id
      and c.start_date <= current_date
      and (c.end_date is null or c.end_date >= current_date)
    order by c.start_date desc
    limit 1
  ) as active_position,
  (
    select c.end_date from hr_contracts c
    where c.employee_id = e.id
    order by c.start_date desc
    limit 1
  ) as latest_contract_end,
  (
    select count(*) from hr_contracts c where c.employee_id = e.id
  )::int as contract_count
from hr_employees e;

-- RLS
alter table hr_employees enable row level security;
alter table hr_contracts enable row level security;
