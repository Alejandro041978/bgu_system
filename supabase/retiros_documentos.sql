-- ===========================================================================
-- Documentos de retiro — bucket PRIVADO
--
-- Son resoluciones que respaldan la situación académica de una persona. Se
-- copian a nuestro almacenamiento en vez de enlazar a Drive: un enlace público
-- depende de que nadie cambie permisos, mueva la carpeta o borre el archivo, y
-- si una acreditadora los pide en tres años el ERP tiene que poder mostrarlos
-- sin depender de un Drive ajeno.
--
-- El bucket va PRIVADO, a diferencia de los cuatro que ya existen: llevan datos
-- personales y motivos de retiro. Se sirven con URL firmada que caduca.
--
-- ANTES de correr esto: crear el bucket en Supabase → Storage → New bucket
--   nombre: withdrawal-docs     public: NO
-- ===========================================================================

create table if not exists withdrawal_documents (
  id            uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references student_withdrawals(id) on delete cascade,
  -- Etapa del proceso: la planilla adjunta documentos distintos en cada una.
  stage         text not null default 'resolucion'
                  check (stage in ('servicios', 'registros', 'resolucion')),
  label         text not null,
  storage_path  text,            -- ruta dentro del bucket privado
  source_url    text,            -- de dónde se copió, para poder rastrearlo
  mime_type     text,
  size_bytes    bigint,
  status        text not null default 'pendiente'
                  check (status in ('pendiente', 'cargado', 'error')),
  error_note    text,
  uploaded_by   text,
  uploaded_at   timestamptz not null default now()
);

create index if not exists idx_wd_docs on withdrawal_documents (withdrawal_id, stage);
create unique index if not exists idx_wd_docs_src
  on withdrawal_documents (withdrawal_id, source_url) where source_url is not null;

alter table withdrawal_documents enable row level security;
grant all on table withdrawal_documents to service_role;

select 'tabla creada' as control, count(*)::text as documentos from withdrawal_documents;
