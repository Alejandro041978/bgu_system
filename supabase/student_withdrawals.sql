-- ============================================================================
-- Registro de retiros (fuente de verdad, gestionada desde NUESTRO ERP).
--   Reemplaza la importación puntual de SystemActiva: de aquí en adelante los
--   IW y LOA nuevos nacen en el ERP (no se vuelve a correr el sync de N8N).
--
--   type:   IW  = retiro permanente (definitivo)
--           LOA = retiro temporal (dura 1 semestre)
--   status: vigente        → activo hoy
--           reincorporado  → el LOA se revirtió, el estudiante volvió
--           convertido_iw  → el LOA venció sin reincorporación → se generó un IW
--
--   Un estudiante puede tener varios registros (p.ej. un LOA y luego su IW),
--   por eso es historial y no un campo suelto en academic_students.
-- Ejecutar en Supabase.
-- ============================================================================
create table if not exists student_withdrawals (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references academic_students(id),
  type              text not null check (type in ('IW', 'LOA')),
  resolution_number text,
  withdrawal_date   date not null,
  expires_at        date,           -- sólo LOA: fin del semestre concedido
  status            text not null default 'vigente' check (status in ('vigente', 'reincorporado', 'convertido_iw')),
  reason            text,           -- motivo declarado por el estudiante
  note              text,           -- notas internas / resultado de la llamada
  converted_to_id   uuid references student_withdrawals(id),  -- el IW generado al vencer este LOA
  source            text not null default 'erp',  -- systemactiva | erp | csv
  created_by        uuid,
  created_at        timestamptz not null default now()
);
create index if not exists student_withdrawals_student_idx on student_withdrawals(student_id);
create index if not exists student_withdrawals_status_idx  on student_withdrawals(status);
create index if not exists student_withdrawals_type_idx    on student_withdrawals(type);

-- ---------------------------------------------------------------------------
-- Backfill: los 285 IW ya importados de SystemActiva pasan al registro.
-- Idempotente: no duplica si ya se corrió (casa por estudiante + resolución).
-- ---------------------------------------------------------------------------
insert into student_withdrawals (student_id, type, resolution_number, withdrawal_date, status, source)
select
  s.id,
  case when upper(coalesce(s.withdrawal_resolution, '')) like '%LOA%' then 'LOA' else 'IW' end,
  s.withdrawal_resolution,
  coalesce(s.withdrawal_date, current_date),
  'vigente',
  'systemactiva'
from academic_students s
where s.situation in ('retiro_permanente', 'retiro_temporal')
  and not exists (
    select 1 from student_withdrawals w
    where w.student_id = s.id
      and coalesce(w.resolution_number, '') = coalesce(s.withdrawal_resolution, '')
  );
