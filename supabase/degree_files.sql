-- Hoja de Control de Degrees (+ Apostilla) — reemplaza el Excel de Registros.
-- Un expediente por titulación (estudiante × programa), enlazado a la
-- solicitud de documento. Cada check guarda fecha Y quién lo marcó.
-- La traducción/homologación es OTRO servicio (hoja aparte, futura).
-- Ejecutar con "Run and enable RLS".
create table if not exists degree_files (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  program_id uuid,
  document_request_id uuid,
  includes_apostille boolean not null default true,
  doc_code text,                       -- correlativo 000001…
  tramite_group text,                  -- G1 2026…
  -- etapas (fecha + responsable automático)
  simplecert_ok_at timestamptz, simplecert_ok_by text,
  sent_florida_at timestamptz, sent_florida_by text,
  printed_at timestamptz, printed_by text,
  notarized_at timestamptz, notarized_by text,
  apostille_started_at timestamptz, apostille_started_by text,
  scans_uploaded_at timestamptz, scans_uploaded_by text, scans_url text,
  digital_sent_at timestamptz, digital_sent_by text,
  -- datos de entrega (precargados del perfil, editables: puede recibir otra persona)
  receiver_name text, receiver_phone text, receiver_address text,
  receiver_references text, receiver_city text, receiver_postal text, receiver_country text,
  courier_sent_at timestamptz, courier_sent_by text, courier_tracking text,
  delivered_at timestamptz, delivered_by text, delivery_proof_url text,
  notes text,
  status text not null default 'en_proceso',   -- en_proceso | entregado
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists degree_files_student_idx on degree_files (student_id);
create index if not exists degree_files_group_idx on degree_files (tramite_group);
create index if not exists degree_files_status_idx on degree_files (status);
create unique index if not exists degree_files_unique_idx on degree_files (student_id, program_id);

-- Bucket privado para escaneos y cargos de entrega
insert into storage.buckets (id, name, public)
values ('degree-files', 'degree-files', false)
on conflict (id) do nothing;
