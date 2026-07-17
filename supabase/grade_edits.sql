-- Edición manual de notas + auditoría.
-- Correr en el SQL Editor de Supabase. La tabla nueva queda con RLS activa
-- (solo el service role la lee/escribe, igual que el resto).

-- Marca de edición manual sobre la nota. El sync de SystemActiva salta las
-- filas con edited_at para no pisar una corrección hecha en el ERP.
alter table academic_grades add column if not exists edited_at timestamptz;
alter table academic_grades add column if not exists edited_by uuid;

-- Toda modificación de una nota deja rastro: qué campo, valor anterior y
-- nuevo, quién, cuándo, por qué y desde dónde (editor | csv | moodle).
create table if not exists grade_audit (
  id uuid primary key default gen_random_uuid(),
  grade_external_id text not null,
  document_number text,
  course_name text,
  field text not null,
  old_value text,
  new_value text,
  reason text,
  origin text not null default 'editor',
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists grade_audit_grade_idx on grade_audit (grade_external_id);
create index if not exists grade_audit_doc_idx on grade_audit (document_number);

alter table grade_audit enable row level security;
