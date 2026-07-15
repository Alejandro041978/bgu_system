-- ============================================================================
-- Fase B: el embudo de retiro (solicitud → llamada humana → resultado).
--
--   Camila detecta la ausencia y dialoga. Cuando el estudiante anuncia que se
--   quiere retirar, se abre una SOLICITUD. Un humano lo llama para explicarle
--   las consecuencias y sus opciones, y marca el resultado:
--     revertido        → se queda (¡retención exitosa!). NO genera retiro.
--     LOA              → retiro temporal (1 semestre)
--     IW voluntario    → definitivo, decidido por el estudiante
--     IW administrativo→ definitivo, decidido por la institución (ausencia)
--
--   Modela el proceso que hoy llevan a mano en la planilla "IWCWLOA".
--   La solicitud es el expediente; student_withdrawals es el resultado.
--   Por eso 'revertido' vive aquí y no allá: no hay retiro que registrar.
-- Ejecutar en Supabase (activar RLS: sólo se accede con service role).
-- ============================================================================
create table if not exists withdrawal_requests (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references academic_students(id),

  -- Origen y pedido
  origin           text not null default 'bot',   -- bot | manual | administrativo
  requested_at     date not null default current_date,
  requested_type   text check (requested_type in ('LOA', 'IW')),  -- lo que pidió
  reason           text,                          -- causa declarada (la traba)
  objection        text,                          -- código de Camila: deuda|tiempo|salud|dificultad|acceso

  -- Foto del momento (para que la llamada no se haga a ciegas)
  inactivity_days  integer,                       -- días sin entrar al aula
  balance          numeric,                       -- saldo al abrir la solicitud
  courses_consumed integer,                       -- asignaturas consumidas

  -- Etapa
  stage            text not null default 'solicitado'
    check (stage in ('solicitado', 'llamada_pendiente', 'llamada_realizada', 'resuelto', 'anulado')),
  assigned_to      uuid,                          -- colaborador que llama
  call_at          timestamptz,
  call_notes       text,                          -- resultado del diálogo

  -- Resultado
  outcome          text check (outcome in ('revertido', 'LOA', 'IW_voluntario', 'IW_administrativo')),
  refund_requested boolean default false,
  withdrawal_id    uuid references student_withdrawals(id),  -- null si fue revertido
  resolved_by      uuid,
  resolved_at      timestamptz,

  created_at       timestamptz not null default now()
);
create index if not exists withdrawal_requests_student_idx on withdrawal_requests(student_id);
create index if not exists withdrawal_requests_stage_idx   on withdrawal_requests(stage);
create index if not exists withdrawal_requests_outcome_idx on withdrawal_requests(outcome);

-- Subtipo del IW (la planilla ya lo distingue: 213 administrativos, 32 voluntarios).
-- No aplica al LOA.
alter table student_withdrawals add column if not exists subtype text
  check (subtype is null or subtype in ('administrativo', 'voluntario'));
