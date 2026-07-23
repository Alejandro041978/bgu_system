-- Documentos de postulación por matrícula (2026-07-23): la asesora adjunta
-- 6 documentos independientes por cada estudiante que postula. Los tipos son
-- configurables (renombrables); se siembran 6 iniciales.
-- Ejecutar con "Run and enable RLS".
create table if not exists admission_doc_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into admission_doc_types (name, sort_order)
select v.name, v.ord from (values
  ('Documento de identidad / Pasaporte', 1),
  ('Diploma o título previo', 2),
  ('Certificado de notas (transcript)', 3),
  ('Fotografía', 4),
  ('Ficha de postulación', 5),
  ('Otro documento', 6)
) as v(name, ord)
where not exists (select 1 from admission_doc_types);

create table if not exists admission_documents (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  doc_type_id uuid not null,
  file_path text not null,
  file_name text,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  unique (enrollment_id, doc_type_id)
);
create index if not exists admission_documents_enr_idx on admission_documents (enrollment_id);

-- Bucket privado para los archivos
insert into storage.buckets (id, name, public)
values ('admission-docs', 'admission-docs', false)
on conflict (id) do nothing;
