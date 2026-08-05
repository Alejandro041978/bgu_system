-- ===========================================================================
-- Sílabos de asignatura
--
-- Un sílabo no se reemplaza: se sucede. La versión que rigió en 2025 sigue
-- siendo la respuesta correcta a "¿qué se enseñó cuando este estudiante cursó
-- la asignatura?", y esa pregunta la hacen las acreditadoras y los trámites de
-- convalidación años después. Por eso cada PDF guarda DESDE QUÉ SEMESTRE rige
-- y ninguno se borra al subir el siguiente: el vigente es simplemente el de
-- vigencia más reciente ya iniciada, y el resto queda detrás como historia.
--
-- La vigencia se ancla al semestre, no a una fecha suelta: el calendario
-- académico ya define cuándo empieza cada uno, y dos personas que suban el
-- mismo sílabo eligiendo "FALL 2026" coinciden, mientras que eligiendo fechas
-- a mano no coincidirían nunca.
-- ===========================================================================

create table if not exists course_syllabi (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references academic_courses(id) on delete cascade,
  semester_id  uuid not null references academic_semesters(id),
  file_path    text not null,          -- ruta dentro del bucket (privado)
  file_name    text,                   -- nombre original, para descargar con sentido
  file_size    integer,
  note         text,
  uploaded_by  uuid,
  uploaded_at  timestamptz not null default now()
);

create index if not exists course_syllabi_course_idx on course_syllabi(course_id);
create index if not exists course_syllabi_semester_idx on course_syllabi(semester_id);

-- Un solo sílabo por asignatura y semestre de vigencia. Subir otro para el
-- mismo semestre es corregir el mismo documento, no añadir una versión: si se
-- permitieran dos, "el vigente" dejaría de tener respuesta única.
create unique index if not exists course_syllabi_course_semester_idx
  on course_syllabi(course_id, semester_id);

-- ── Archivo en Storage ─────────────────────────────────────────────────────
-- Bucket PRIVADO y lectura por URL firmada temporal, como el resto del ERP
-- desde la auditoría del 29-07. Un sílabo no es secreto, pero tampoco tiene por
-- qué quedar indexado en un buscador con una URL eterna.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('syllabi', 'syllabi', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  public = false,
  file_size_limit = 20971520,
  allowed_mime_types = array['application/pdf'];

-- RLS cerrado: se entra por las rutas del ERP con service_role, que es donde
-- vive la autorización. NUNCA políticas para `authenticated` — los estudiantes
-- tienen sesión de Supabase.
alter table course_syllabi enable row level security;

grant all on table course_syllabi to service_role;
