-- Adjuntos e imágenes incrustadas de los correos del buzón.
-- Los archivos viven en el bucket privado 'inbox-attachments' de Storage;
-- esta tabla es el índice (qué archivo pertenece a qué mensaje, y su
-- Content-ID cuando es una imagen incrustada en el HTML).
create table if not exists wa_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references wa_messages(id) on delete cascade,
  conversation_id uuid not null,
  filename text not null,
  mime_type text,
  content_id text,          -- Content-ID del correo (imágenes inline: cid:...)
  size_bytes bigint,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists wa_attachments_message_idx on wa_attachments (message_id);
create index if not exists wa_attachments_conversation_idx on wa_attachments (conversation_id);

-- Bucket privado (se sirve con URLs firmadas desde la API)
insert into storage.buckets (id, name, public)
values ('inbox-attachments', 'inbox-attachments', false)
on conflict (id) do nothing;
