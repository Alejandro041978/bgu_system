-- ============================================================================
-- Bitácora de la campaña de Camila.
--
--   student_tracking sólo guarda el ÚLTIMO estado (contact_attempts,
--   last_contact_at), así que no permite responder "¿el mensaje del día 3
--   funciona mejor que el del día 7?" — que es justo lo que hace falta para
--   afinar la cadencia. Esto es una fila POR ENVÍO.
--
--   Es barato ahora e imposible de reconstruir después: lo que salga sin
--   registrar se pierde para siempre.
-- Ejecutar en Supabase (activar RLS: sólo service role).
-- ============================================================================
create table if not exists retention_contacts (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references academic_students(id),
  template_key    text not null,
  language        text,
  attempt         integer not null,        -- 1..4 (día 1/3/7/14)
  sent_at         timestamptz not null default now(),

  -- Foto del momento: sin esto no se puede analizar a posteriori, porque
  -- student_tracking se sobrescribe todos los días.
  inactivity_days integer,
  balance         numeric,

  twilio_sid      text,                    -- SID del mensaje, para auditar entrega
  status          text not null default 'sent',   -- sent | failed
  error           text,

  -- Se completan cuando el estudiante reacciona
  replied_at      timestamptz,
  outcome         text,                    -- el código [[R: ...]] que resultó

  created_at      timestamptz not null default now()
);
create index if not exists retention_contacts_student_idx  on retention_contacts(student_id);
create index if not exists retention_contacts_template_idx on retention_contacts(template_key);
create index if not exists retention_contacts_sent_idx     on retention_contacts(sent_at);

-- ---------------------------------------------------------------------------
-- Marca de cohorte: cuándo el estudiante entró al grupo elegible.
--
--   Es lo que hace posible el GRUPO DE CONTROL. Con tope de 10/día y 378
--   elegibles, los que aún no reciben nada son un control natural y gratis:
--     contactado  = contact_attempts > 0
--     volvió      = last_moodle_access > campaign_entered_at
--   Si vuelve el 12% de los contactados y el 4% de los no contactados, Camila
--   causó 8 puntos. Sin esta marca nos atribuiríamos a los que iban a volver
--   solos, y no hay forma de reconstruirla más tarde.
-- ---------------------------------------------------------------------------
alter table student_tracking add column if not exists campaign_entered_at timestamptz;
