-- Comentarios por venta de admisión (matrícula): notas de las asesoras y
-- coordinación sobre cada postulante en la página de Ventas y Comisiones.
-- Ejecutar con "Run and enable RLS".
create table if not exists admission_sale_comments (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null,
  body text not null,
  author_id uuid,
  author_name text,
  created_at timestamptz not null default now()
);
create index if not exists admission_sale_comments_enr_idx on admission_sale_comments (enrollment_id, created_at);
