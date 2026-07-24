-- Motor de campañas outbound (2026-07-23, arquitectura aprobada por el usuario).
-- UN número, UNA persona (Micaela), MÚLTIPLES campañas mutuamente excluyentes
-- segmentadas por estado del estudiante. El libro mayor de contactos y el
-- opt-out GLOBAL protegen el número de bloqueos.
-- Ejecutar con "Run and enable RLS".

-- Catálogo de campañas (la elegibilidad vive en código; aquí la configuración)
create table if not exists campaigns (
  key text primary key,
  name text not null,
  description text,
  priority int not null default 100,     -- menor = más prioritaria al colisionar
  cooldown_days int not null default 7,  -- días mínimos entre contactos al MISMO estudiante (global entre campañas)
  active boolean not null default false, -- las campañas nacen APAGADAS
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into campaigns (key, name, description, priority, active) values
  ('titulacion', 'Titulación', 'Egresado sin título: asistencia para tramitar su título final o certificado final (DCE)', 10, false),
  ('ausente',    'Ausente',    'Activo faltando a clases: regresa (si revela deuda, transiciona a Cobranza)', 20, false),
  ('cobranza',   'Cobranza',   'Activo con cuota vencida: orientación amable para pagar fácilmente', 30, false),
  ('cashpay',    'Cash Pay',   'Activo al día: descuento por pronto pago', 40, false),
  ('iw',         'IW',         'Retirado (IW): regresa y termina tu programa', 50, false),
  ('loa',        'LOA',        'En licencia (LOA): plazo por vencer, no pierdas los beneficios logrados (beca)', 60, false)
on conflict (key) do nothing;

-- Libro mayor de contactos: TODO contacto outbound queda aquí, de cualquier
-- campaña — la regla de cooldown se evalúa contra este libro, no por campaña.
create table if not exists campaign_contacts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  campaign_key text not null,
  channel text not null default 'whatsapp',
  template text,
  body text,
  sent_at timestamptz not null default now(),
  outcome text,                          -- respondió | convertido | sin_respuesta | error
  outcome_at timestamptz,
  note text
);
create index if not exists campaign_contacts_student_idx on campaign_contacts (student_id, sent_at desc);
create index if not exists campaign_contacts_campaign_idx on campaign_contacts (campaign_key, sent_at desc);

-- Opt-out UNIVERSAL: aplica a TODAS las campañas del número, para siempre.
create table if not exists campaign_optouts (
  student_id uuid primary key,
  reason text,
  created_at timestamptz not null default now(),
  created_by text
);

-- Transiciones (p. ej. Ausente → Cobranza cuando el estudiante revela deuda)
create table if not exists campaign_transitions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  from_key text not null,
  to_key text not null,
  reason text,
  created_at timestamptz not null default now()
);
