-- Exámenes solicitables por el estudiante (subsanación y los que vengan).
-- Flujo: solicita (si es elegible) → cargo al estado de cuenta → al pagarse
-- pasa a la Hoja de Control → el administrativo notifica, toma el examen y
-- registra la nota → viaja a retake_grade del acta (la mejor gana).
-- Ejecutar con "Run and enable RLS".
create table if not exists exam_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric not null default 0,
  charge_concept int,                 -- tipo contable del cargo (account_concepts)
  active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into exam_types (name, price) values ('Examen de Subsanación', 20)
on conflict (name) do nothing;

create table if not exists exam_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null,
  exam_type_id uuid not null references exam_types(id),
  grade_external_id uuid,             -- fila del acta a subsanar
  course_code text,
  course_name text,
  status text not null default 'pendiente_pago',  -- pendiente_pago | pendiente_evaluacion | evaluado | anulado
  charge_external_id text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  notified_at timestamptz,
  result_grade numeric,
  evaluated_by text,
  evaluated_at timestamptz
);
create index if not exists exam_requests_student_idx on exam_requests (student_id);
create index if not exists exam_requests_status_idx on exam_requests (status);
create index if not exists exam_requests_charge_idx on exam_requests (charge_external_id);
