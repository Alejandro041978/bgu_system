-- Plantillas de contratos
create table if not exists contract_templates (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  body text not null, -- texto con variables {{full_name}}, {{start_date}}, etc.
  variables jsonb default '[]', -- lista de variables detectadas
  status text default 'active' check (status in ('active', 'draft', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Contratos generados para firmar
create table if not exists contract_instances (
  id uuid default gen_random_uuid() primary key,
  template_id uuid not null references contract_templates(id) on delete restrict,
  rendered_body text not null, -- texto final con variables sustituidas
  signer_name text not null,
  signer_email text not null,
  signer_type text not null check (signer_type in ('employee', 'teacher', 'student', 'other')),
  signer_ref_id uuid, -- id en hr_employees u otra tabla
  token text not null unique default gen_random_uuid()::text,
  token_expires_at timestamptz not null default now() + interval '30 days',
  status text default 'pending' check (status in ('pending', 'signed', 'expired', 'cancelled')),
  signed_at timestamptz,
  ip_address text,
  user_agent text,
  field_values jsonb default '{}', -- valores usados para rellenar variables
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Códigos OTP para verificación al firmar
create table if not exists contract_otp (
  id uuid default gen_random_uuid() primary key,
  contract_instance_id uuid not null references contract_instances(id) on delete cascade,
  code text not null,
  expires_at timestamptz not null default now() + interval '10 minutes',
  used boolean default false,
  created_at timestamptz default now()
);

alter table contract_templates enable row level security;
alter table contract_instances enable row level security;
alter table contract_otp enable row level security;
